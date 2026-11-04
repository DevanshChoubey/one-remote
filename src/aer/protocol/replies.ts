// From aer-remote src/protocol/replies.ts (2026-11-04). Adapted: none.
import type { CborMap, CborValue } from './cbor';
import { decodeScheduleEntry, type Schedule } from './schedule';

export interface Reply {
  mT: number;
  mN: number;
  ack: number;
  body: CborMap;
}

const isMap = (v: CborValue | undefined): v is CborMap =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);

export function toReply(v: CborValue): Reply | null {
  if (!isMap(v)) return null;
  const { mT, mN, ack } = v;
  if (typeof mT !== 'number' || typeof mN !== 'number') return null;
  return { mT, mN, ack: typeof ack === 'number' ? ack : 0, body: v };
}

function toBytes(v: CborValue | undefined): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'number'))
    return Uint8Array.from(v as number[]);
  return null;
}

/** A reply the device sent in a shape this app does not understand. */
export class ReplyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplyParseError';
  }
}

/**
 * The schedules in a retrieve reply. A missing, null or empty `S` means none (a dispenser with no
 * schedules may omit it). Anything undecodable throws, so a list is never silently shortened.
 */
export function parseSchedules(r: Reply): Schedule[] {
  const list = r.body.S;
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new ReplyParseError('schedule list is not an array');
  return list.map((item, i) => {
    const bytes = isMap(item) ? toBytes(item.s) : null;
    if (!bytes) throw new ReplyParseError(`schedule ${i} has no entry bytes`);
    try {
      return decodeScheduleEntry(bytes);
    } catch (e) {
      throw new ReplyParseError(`schedule ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}
