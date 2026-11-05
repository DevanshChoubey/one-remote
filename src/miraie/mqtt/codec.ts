/**
 * A small MQTT 3.1.1 codec: only the packets the MirAIe connection uses (CONNECT, CONNACK, PUBLISH,
 * PUBACK, SUBSCRIBE, SUBACK, PINGREQ, PINGRESP, DISCONNECT). Pure, so it runs in plain Jest; the
 * fake broker in `../testing` decodes the client's packets with the same code.
 */

export const PACKET = {
  connect: 1,
  connack: 2,
  publish: 3,
  puback: 4,
  subscribe: 8,
  suback: 9,
  pingreq: 12,
  pingresp: 13,
  disconnect: 14,
} as const;

/** Refuses a packet larger than this; MirAIe messages are a few hundred bytes. */
export const MAX_PACKET_BYTES = 256 * 1024;

export class MqttProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MqttProtocolError';
    Object.setPrototypeOf(this, MqttProtocolError.prototype);
  }
}

export type QoS = 0 | 1;

export type Packet =
  | {
      type: 'connect';
      clientId: string;
      username?: string;
      password?: string;
      keepAlive: number;
      clean: boolean;
      protocolLevel: number;
    }
  | { type: 'connack'; sessionPresent: boolean; returnCode: number }
  | {
      type: 'publish';
      topic: string;
      payload: Uint8Array;
      qos: QoS;
      packetId?: number;
      retain: boolean;
      dup: boolean;
    }
  | { type: 'puback'; packetId: number }
  | { type: 'subscribe'; packetId: number; topics: { topic: string; qos: QoS }[] }
  | { type: 'suback'; packetId: number; granted: number[] }
  | { type: 'pingreq' }
  | { type: 'pingresp' }
  | { type: 'disconnect' };

// ---- UTF-8 (Hermes' TextDecoder is not everywhere, so this stays self-contained) ----

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return Uint8Array.from(out);
}

/** Decodes UTF-8; a malformed sequence becomes U+FFFD. */
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  let i = 0;
  const cont = (k: number): number => {
    const v = b[k];
    if (v === undefined || (v & 0xc0) !== 0x80) throw new RangeError('bad continuation');
    return v & 63;
  };
  while (i < b.length) {
    const c = b[i] ?? 0;
    try {
      if (c < 0x80) {
        s += String.fromCharCode(c);
        i += 1;
      } else if (c >= 0xc2 && c < 0xe0) {
        s += String.fromCharCode(((c & 31) << 6) | cont(i + 1));
        i += 2;
      } else if (c >= 0xe0 && c < 0xf0) {
        const cp = ((c & 15) << 12) | (cont(i + 1) << 6) | cont(i + 2);
        if (cp < 0x800) throw new RangeError('overlong');
        s += String.fromCharCode(cp);
        i += 3;
      } else if (c >= 0xf0 && c < 0xf5) {
        const cp = ((c & 7) << 18) | (cont(i + 1) << 12) | (cont(i + 2) << 6) | cont(i + 3);
        if (cp < 0x10000 || cp > 0x10ffff) throw new RangeError('out of range');
        s += String.fromCodePoint(cp);
        i += 4;
      } else {
        throw new RangeError('bad lead byte');
      }
    } catch {
      s += '�';
      i += 1;
    }
  }
  return s;
}

// ---- encoding ----

class Writer {
  private readonly bytes: number[] = [];

  byte(n: number): this {
    this.bytes.push(n & 0xff);
    return this;
  }

  u16(n: number): this {
    return this.byte(n >> 8).byte(n);
  }

  raw(b: Uint8Array): this {
    for (const x of b) this.bytes.push(x);
    return this;
  }

  str(s: string): this {
    const b = utf8Encode(s);
    if (b.length > 0xffff) throw new MqttProtocolError('String too long');
    return this.u16(b.length).raw(b);
  }

  get length(): number {
    return this.bytes.length;
  }

  toArray(): number[] {
    return this.bytes;
  }
}

function frame(firstByte: number, body: Writer): Uint8Array {
  let len = body.length;
  if (len > MAX_PACKET_BYTES) throw new MqttProtocolError('Packet too large');
  const head: number[] = [firstByte];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    head.push(digit);
  } while (len > 0);
  return Uint8Array.from([...head, ...body.toArray()]);
}

function checkPacketId(id: number): void {
  if (!Number.isInteger(id) || id < 1 || id > 0xffff) {
    throw new MqttProtocolError('Bad packet id');
  }
}

/** A topic to publish to: no wildcards, no NUL, not empty. */
function checkTopic(topic: string, filter: boolean): void {
  if (topic.length === 0 || topic.includes('\u0000')) throw new MqttProtocolError('Bad topic');
  if (!filter && /[+#]/.test(topic)) throw new MqttProtocolError('Wildcard in a topic name');
}

export function encodeConnect(o: {
  clientId: string;
  username?: string;
  password?: string;
  keepAlive: number;
  clean?: boolean;
}): Uint8Array {
  let flags = o.clean === false ? 0 : 0x02;
  if (o.username !== undefined) flags |= 0x80;
  if (o.password !== undefined) {
    if (o.username === undefined) throw new MqttProtocolError('Password without a username');
    flags |= 0x40;
  }
  const w = new Writer().str('MQTT').byte(4).byte(flags).u16(o.keepAlive).str(o.clientId);
  if (o.username !== undefined) w.str(o.username);
  if (o.password !== undefined) w.str(o.password);
  return frame(PACKET.connect << 4, w);
}

export function encodeConnack(sessionPresent: boolean, returnCode: number): Uint8Array {
  return frame(PACKET.connack << 4, new Writer().byte(sessionPresent ? 1 : 0).byte(returnCode));
}

export function encodePublish(o: {
  topic: string;
  payload: Uint8Array | string;
  qos?: QoS;
  packetId?: number;
  retain?: boolean;
}): Uint8Array {
  checkTopic(o.topic, false);
  const qos = o.qos ?? 0;
  const w = new Writer().str(o.topic);
  if (qos > 0) {
    checkPacketId(o.packetId ?? 0);
    w.u16(o.packetId ?? 0);
  }
  w.raw(typeof o.payload === 'string' ? utf8Encode(o.payload) : o.payload);
  return frame((PACKET.publish << 4) | (qos << 1) | (o.retain ? 1 : 0), w);
}

export function encodePuback(packetId: number): Uint8Array {
  checkPacketId(packetId);
  return frame(PACKET.puback << 4, new Writer().u16(packetId));
}

export function encodeSubscribe(
  packetId: number,
  topics: { topic: string; qos: QoS }[],
): Uint8Array {
  checkPacketId(packetId);
  if (topics.length === 0) throw new MqttProtocolError('Nothing to subscribe to');
  const w = new Writer().u16(packetId);
  for (const t of topics) {
    checkTopic(t.topic, true);
    w.str(t.topic).byte(t.qos);
  }
  // SUBSCRIBE carries the reserved flags 0010.
  return frame((PACKET.subscribe << 4) | 0x02, w);
}

export function encodeSuback(packetId: number, granted: number[]): Uint8Array {
  const w = new Writer().u16(packetId);
  for (const g of granted) w.byte(g);
  return frame(PACKET.suback << 4, w);
}

export const encodePingreq = (): Uint8Array => Uint8Array.from([PACKET.pingreq << 4, 0]);
export const encodePingresp = (): Uint8Array => Uint8Array.from([PACKET.pingresp << 4, 0]);
export const encodeDisconnect = (): Uint8Array => Uint8Array.from([PACKET.disconnect << 4, 0]);

// ---- decoding ----

class Reader {
  private i = 0;

  constructor(private readonly b: Uint8Array) {}

  byte(): number {
    const v = this.b[this.i];
    if (v === undefined) throw new MqttProtocolError('Packet ends early');
    this.i += 1;
    return v;
  }

  u16(): number {
    return (this.byte() << 8) | this.byte();
  }

  bytes(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new MqttProtocolError('Packet ends early');
    const out = this.b.slice(this.i, this.i + n);
    this.i += n;
    return out;
  }

  str(): string {
    return utf8Decode(this.bytes(this.u16()));
  }

  rest(): Uint8Array {
    return this.bytes(this.b.length - this.i);
  }

  get left(): number {
    return this.b.length - this.i;
  }
}

function decodeBody(first: number, body: Uint8Array): Packet {
  const type = first >> 4;
  const flags = first & 0x0f;
  const r = new Reader(body);
  switch (type) {
    case PACKET.connect: {
      const proto = r.str();
      const protocolLevel = r.byte();
      if (proto !== 'MQTT' && proto !== 'MQIsdp') throw new MqttProtocolError('Not MQTT');
      const f = r.byte();
      const keepAlive = r.u16();
      const clientId = r.str();
      if (f & 0x04) {
        r.str();
        r.bytes(r.u16());
      }
      const username = f & 0x80 ? r.str() : undefined;
      const password = f & 0x40 ? r.str() : undefined;
      return {
        type: 'connect',
        clientId,
        keepAlive,
        clean: (f & 0x02) !== 0,
        protocolLevel,
        ...(username !== undefined ? { username } : {}),
        ...(password !== undefined ? { password } : {}),
      };
    }
    case PACKET.connack: {
      const ack = r.byte();
      return { type: 'connack', sessionPresent: (ack & 1) === 1, returnCode: r.byte() };
    }
    case PACKET.publish: {
      const qos = (flags >> 1) & 3;
      if (qos > 1) throw new MqttProtocolError('QoS 2 is not supported');
      const topic = r.str();
      const packetId = qos > 0 ? r.u16() : undefined;
      return {
        type: 'publish',
        topic,
        qos: qos as QoS,
        retain: (flags & 1) === 1,
        dup: (flags & 8) === 8,
        payload: r.rest(),
        ...(packetId !== undefined ? { packetId } : {}),
      };
    }
    case PACKET.puback:
      return { type: 'puback', packetId: r.u16() };
    case PACKET.subscribe: {
      const packetId = r.u16();
      const topics: { topic: string; qos: QoS }[] = [];
      while (r.left > 0) topics.push({ topic: r.str(), qos: (r.byte() & 1) as QoS });
      return { type: 'subscribe', packetId, topics };
    }
    case PACKET.suback: {
      const packetId = r.u16();
      const granted: number[] = [];
      while (r.left > 0) granted.push(r.byte());
      return { type: 'suback', packetId, granted };
    }
    case PACKET.pingreq:
      return { type: 'pingreq' };
    case PACKET.pingresp:
      return { type: 'pingresp' };
    case PACKET.disconnect:
      return { type: 'disconnect' };
    default:
      throw new MqttProtocolError(`Unsupported packet type ${type}`);
  }
}

/**
 * Turns a byte stream into packets. `push` may be given any slice of the stream (half a packet, or
 * several); each whole packet comes out once, in order. Throws MqttProtocolError on bad bytes,
 * after which the stream should be closed.
 */
export class PacketReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Packet[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.length);
    this.buf = joined;
    const out: Packet[] = [];
    for (;;) {
      const p = this.next();
      if (!p) break;
      out.push(p);
    }
    return out;
  }

  private next(): Packet | null {
    const b = this.buf;
    if (b.length < 2) return null;
    let len = 0;
    let mult = 1;
    let i = 1;
    for (;;) {
      const d = b[i];
      if (d === undefined) return null;
      len += (d & 0x7f) * mult;
      i += 1;
      if ((d & 0x80) === 0) break;
      mult *= 128;
      if (i > 4) throw new MqttProtocolError('Bad remaining length');
    }
    if (len > MAX_PACKET_BYTES) throw new MqttProtocolError('Packet too large');
    if (b.length < i + len) return null;
    const packet = decodeBody(b[0] ?? 0, b.slice(i, i + len));
    this.buf = b.slice(i + len);
    return packet;
  }
}
