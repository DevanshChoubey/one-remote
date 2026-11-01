/**
 * Protocol Buffers wire format, the subset the Android TV Remote Service uses: varints,
 * length-delimited fields, and skipping of fixed-width fields. Hand-written to keep the bundle small.
 */

/** The largest frame accepted from the TV, in bytes. A longer length closes the stream. */
export const MAX_FRAME = 65536;

/** Field number to its values in wire order: bigint for varints, Uint8Array for length-delimited. */
export type FieldMap = Map<number, (bigint | Uint8Array)[]>;

function varintBytes(v: bigint): number[] {
  const out: number[] = [];
  let x = v;
  while (x >= 0x80n) {
    out.push(Number(x & 0x7fn) | 0x80);
    x >>= 7n;
  }
  out.push(Number(x));
  return out;
}

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

function utf8Decode(b: Uint8Array): string {
  let s = '';
  let i = 0;
  while (i < b.length) {
    const b0 = b[i] ?? 0;
    let len = 1;
    let c = b0;
    if (b0 >= 0xf0) {
      len = 4;
      c = b0 & 0x07;
    } else if (b0 >= 0xe0) {
      len = 3;
      c = b0 & 0x0f;
    } else if (b0 >= 0xc0) {
      len = 2;
      c = b0 & 0x1f;
    } else if (b0 >= 0x80) {
      // A stray continuation byte.
      c = 0xfffd;
    }
    for (let k = 1; k < len; k++) c = (c << 6) | ((b[i + k] ?? 0) & 0x3f);
    if (c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) c = 0xfffd;
    s += String.fromCodePoint(c);
    i += len;
  }
  return s;
}

/** Builds one protobuf message, field by field. */
export class ProtoWriter {
  private readonly out: number[] = [];

  private key(field: number, wire: number): void {
    this.out.push(...varintBytes(BigInt(field * 8 + wire)));
  }

  /** A varint. Negative values are written as 64-bit two's complement (ten bytes). */
  varint(field: number, v: number): this {
    this.key(field, 0);
    this.out.push(...varintBytes(BigInt.asUintN(64, BigInt(v))));
    return this;
  }

  bool(field: number, v: boolean): this {
    return this.varint(field, v ? 1 : 0);
  }

  string(field: number, s: string): this {
    return this.bytes(field, Uint8Array.from(utf8Encode(s)));
  }

  bytes(field: number, b: Uint8Array): this {
    this.key(field, 2);
    this.out.push(...varintBytes(BigInt(b.length)));
    for (const x of b) this.out.push(x);
    return this;
  }

  message(field: number, m: ProtoWriter): this {
    return this.bytes(field, m.finish());
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/** Parses one protobuf message into its fields. Throws Error('malformed') on truncation or on a
 *  group wire type (3 or 4). Fixed-width fields (wire types 1 and 5) are skipped. */
export function readFields(b: Uint8Array): FieldMap {
  const out: FieldMap = new Map();
  let p = 0;
  const malformed = (): never => {
    throw new Error('malformed');
  };
  const skip = (n: number): void => {
    if (p + n > b.length) malformed();
    p += n;
  };
  const varint = (): bigint => {
    let v = 0n;
    let shift = 0n;
    for (;;) {
      if (p >= b.length || shift > 63n) malformed();
      const byte = b[p++] ?? 0;
      v |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return v;
      shift += 7n;
    }
  };
  const add = (n: number, v: bigint | Uint8Array): void => {
    const list = out.get(n);
    if (list) list.push(v);
    else out.set(n, [v]);
  };
  while (p < b.length) {
    const key = varint();
    const wire = Number(key & 7n);
    const field = Number(key >> 3n);
    switch (wire) {
      case 0:
        add(field, varint());
        break;
      case 1:
        skip(8);
        break;
      case 2: {
        const len = Number(varint());
        if (p + len > b.length) malformed();
        add(field, b.subarray(p, p + len));
        p += len;
        break;
      }
      case 5:
        skip(4);
        break;
      default:
        malformed();
    }
  }
  return out;
}

const first = (f: FieldMap, n: number): bigint | Uint8Array | undefined => f.get(n)?.[0];

/** The first value of field `n` as a signed 32-bit int. */
export function int32(f: FieldMap, n: number): number | undefined {
  const v = first(f, n);
  return typeof v === 'bigint' ? Number(BigInt.asIntN(32, v)) : undefined;
}

/** The first value of field `n` as an unsigned number. */
export function uint(f: FieldMap, n: number): number | undefined {
  const v = first(f, n);
  return typeof v === 'bigint' ? Number(v) : undefined;
}

export function bool(f: FieldMap, n: number): boolean | undefined {
  const v = first(f, n);
  return typeof v === 'bigint' ? v !== 0n : undefined;
}

export function str(f: FieldMap, n: number): string | undefined {
  const v = first(f, n);
  return v instanceof Uint8Array ? utf8Decode(v) : undefined;
}

/** The first value of field `n` parsed as a nested message. */
export function sub(f: FieldMap, n: number): FieldMap | undefined {
  const v = first(f, n);
  return v instanceof Uint8Array ? readFields(v) : undefined;
}

/** A message with its varint length prefix, ready for the stream. */
export function frame(msg: Uint8Array): Uint8Array {
  const head = varintBytes(BigInt(msg.length));
  const out = new Uint8Array(head.length + msg.length);
  out.set(head, 0);
  out.set(msg, head.length);
  return out;
}

/** Splits a byte stream into whole length-prefixed frames, keeping any partial tail for the next
 *  chunk. */
export class FrameReader {
  private buf: Uint8Array = new Uint8Array(0);

  /** Whole frames completed by this chunk, in order. Throws Error('frameTooLarge') when a length
   *  prefix exceeds MAX_FRAME; the caller closes the stream. */
  push(chunk: Uint8Array): Uint8Array[] {
    const data = new Uint8Array(this.buf.length + chunk.length);
    data.set(this.buf, 0);
    data.set(chunk, this.buf.length);
    const frames: Uint8Array[] = [];
    let p = 0;
    for (;;) {
      let len = 0;
      let mult = 1;
      let i = p;
      let complete = false;
      while (i < data.length) {
        const byte = data[i++] ?? 0;
        len += (byte & 0x7f) * mult;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
        mult *= 128;
        // Three continuation bytes already mean a length of at least 2^21, far past MAX_FRAME.
        if (mult >= 2 ** 21) throw new Error('frameTooLarge');
      }
      if (!complete) break;
      if (len > MAX_FRAME) throw new Error('frameTooLarge');
      if (data.length - i < len) break;
      frames.push(data.slice(i, i + len));
      p = i + len;
    }
    this.buf = data.slice(p);
    return frames;
  }
}
