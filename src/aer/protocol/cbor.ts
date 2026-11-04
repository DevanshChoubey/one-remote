// From aer-remote src/protocol/cbor.ts (2026-11-04). Adapted: none.
/**
 * Minimal CBOR codec matching the byte output of Jackson CBOR (the vendor app).
 * Pure TypeScript: Uint8Array/DataView only, no Node or React Native APIs.
 */

export type CborValue =
  number | bigint | string | boolean | null | Uint8Array | CborValue[] | CborMap;
export interface CborMap {
  [key: string]: CborValue;
}
export type CborEntry = [key: string, value: CborValue, opts?: { uint64?: boolean }];

export class CborError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CborError';
  }
}

const MAX_UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);
const TWO_32 = 4294967296;

// ---------- UTF-8 ----------

function utf8Encode(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    let cp: number;
    let extra: number;
    if (b0 < 0x80) {
      cp = b0;
      extra = 0;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      extra = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      extra = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      extra = 3;
    } else {
      throw new CborError('invalid UTF-8');
    }
    if (i + extra > bytes.length - 1 && extra > 0) {
      throw new CborError('truncated UTF-8');
    }
    for (let k = 1; k <= extra; k++) {
      const b = bytes[i + k] ?? 0;
      if ((b & 0xc0) !== 0x80) throw new CborError('invalid UTF-8');
      cp = (cp << 6) | (b & 0x3f);
    }
    i += extra + 1;
    if (cp >= 0x10000) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

// ---------- Encoder ----------

function head(major: number, value: number | bigint, forceEight: boolean): number[] {
  const m = major << 5;
  const big = typeof value === 'bigint' ? value : BigInt(value);
  if (big < BigInt(0) || big > MAX_UINT64) throw new CborError('integer out of range');
  if (!forceEight && big < BigInt(24)) return [m | Number(big)];
  if (!forceEight && big < BigInt(256)) return [m | 24, Number(big)];
  if (!forceEight && big < BigInt(65536))
    return [m | 25, Number(big >> BigInt(8)), Number(big & BigInt(255))];
  const out: number[] = [];
  if (!forceEight && big < BigInt(TWO_32)) {
    out.push(m | 26);
    for (let shift = 24; shift >= 0; shift -= 8)
      out.push(Number((big >> BigInt(shift)) & BigInt(255)));
    return out;
  }
  out.push(m | 27);
  for (let shift = 56; shift >= 0; shift -= 8)
    out.push(Number((big >> BigInt(shift)) & BigInt(255)));
  return out;
}

function encodeInt(value: number | bigint, forceEight: boolean, out: number[]): void {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new CborError('only integer numbers are supported');
  }
  const big = typeof value === 'bigint' ? value : BigInt(value);
  if (big >= BigInt(0)) {
    out.push(...head(0, big, forceEight));
  } else {
    if (forceEight) throw new CborError('uint64 requires a non-negative value');
    out.push(...head(1, -big - BigInt(1), false));
  }
}

function encodeText(text: string, out: number[]): void {
  const bytes = utf8Encode(text);
  out.push(...head(3, bytes.length, false));
  for (const b of bytes) out.push(b);
}

function encodeValue(value: CborValue, out: number[], forceEight = false): void {
  if (value === null) {
    out.push(0xf6);
  } else if (typeof value === 'boolean') {
    out.push(value ? 0xf5 : 0xf4);
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    encodeInt(value, forceEight, out);
  } else if (typeof value === 'string') {
    encodeText(value, out);
  } else if (value instanceof Uint8Array) {
    out.push(...head(2, value.length, false));
    for (const b of value) out.push(b);
  } else if (Array.isArray(value)) {
    out.push(0x9f);
    for (const item of value) encodeValue(item, out);
    out.push(0xff);
  } else {
    out.push(0xbf);
    for (const key of Object.keys(value)) {
      encodeText(key, out);
      encodeValue(value[key] as CborValue, out);
    }
    out.push(0xff);
  }
}

export function encodeMap(entries: CborEntry[]): Uint8Array {
  const out: number[] = [0xbf];
  for (const [key, value, opts] of entries) {
    encodeText(key, out);
    encodeValue(value, out, opts?.uint64 === true);
  }
  out.push(0xff);
  return Uint8Array.from(out);
}

// ---------- Decoder ----------

/** Thrown internally when the buffer ends mid-item; surfaced as `null`. */
class Incomplete extends Error {}

const BREAK = Symbol('break');

class Reader {
  private pos = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position(): number {
    return this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new Incomplete();
  }

  private u8(): number {
    this.need(1);
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  private argument(info: number): number | bigint {
    if (info < 24) return info;
    let v: number;
    switch (info) {
      case 24:
        return this.u8();
      case 25:
        this.need(2);
        v = this.view.getUint16(this.pos);
        this.pos += 2;
        return v;
      case 26:
        this.need(4);
        v = this.view.getUint32(this.pos);
        this.pos += 4;
        return v;
      case 27: {
        this.need(8);
        const hi = this.view.getUint32(this.pos);
        const lo = this.view.getUint32(this.pos + 4);
        this.pos += 8;
        if (hi < 0x200000) return hi * TWO_32 + lo; // <= 2^53 - 1
        return (BigInt(hi) << BigInt(32)) | BigInt(lo);
      }
      default:
        throw new CborError(`unsupported additional info ${info}`);
    }
  }

  private length(info: number): number {
    const n = this.argument(info);
    if (typeof n === 'bigint') throw new CborError('length too large');
    return n;
  }

  private take(n: number): Uint8Array {
    this.need(n);
    const slice = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  read(): CborValue {
    const v = this.readItem();
    if (v === BREAK) throw new CborError('unexpected break');
    return v;
  }

  private readItem(): CborValue | typeof BREAK {
    const initial = this.u8();
    const major = initial >> 5;
    const info = initial & 0x1f;
    switch (major) {
      case 0:
        return this.argument(info);
      case 1: {
        const n = this.argument(info);
        if (typeof n === 'bigint') return -n - BigInt(1);
        return -1 - n;
      }
      case 2:
        if (info === 31) throw new CborError('indefinite byte strings unsupported');
        return this.take(this.length(info));
      case 3:
        if (info === 31) throw new CborError('indefinite text strings unsupported');
        return utf8Decode(this.take(this.length(info)));
      case 4:
        return this.readArray(info);
      case 5:
        return this.readMap(info);
      case 6:
        throw new CborError('tags unsupported');
      default:
        return this.readSimple(info);
    }
  }

  private readSimple(info: number): CborValue | typeof BREAK {
    switch (info) {
      case 20:
        return false;
      case 21:
        return true;
      case 22:
        return null;
      case 31:
        return BREAK;
      default:
        throw new CborError(`unsupported simple/float value ${info}`);
    }
  }

  private readArray(info: number): CborValue[] {
    const out: CborValue[] = [];
    if (info === 31) {
      for (;;) {
        const item = this.readItem();
        if (item === BREAK) return out;
        out.push(item);
      }
    }
    const n = this.length(info);
    for (let i = 0; i < n; i++) out.push(this.read());
    return out;
  }

  private readMap(info: number): CborMap {
    const out: CborMap = {};
    const readKey = (): string => {
      const key = this.readItem();
      if (typeof key !== 'string') throw new CborError('map keys must be text strings');
      return key;
    };
    if (info === 31) {
      for (;;) {
        const peek = this.bytes[this.pos];
        if (peek === undefined) throw new Incomplete();
        if (peek === 0xff) {
          this.pos += 1;
          return out;
        }
        const key = readKey();
        out[key] = this.read();
      }
    }
    const n = this.length(info);
    for (let i = 0; i < n; i++) {
      const key = readKey();
      out[key] = this.read();
    }
    return out;
  }
}

/** Decode the first CBOR item in `bytes`. Returns null if the frame is incomplete. */
export function decodeFirst(bytes: Uint8Array): { value: CborValue; length: number } | null {
  const reader = new Reader(bytes);
  try {
    const value = reader.read();
    return { value, length: reader.position };
  } catch (e) {
    if (e instanceof Incomplete) return null;
    throw e;
  }
}
