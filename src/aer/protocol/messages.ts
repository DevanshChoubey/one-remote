// From aer-remote src/protocol/messages.ts (2026-11-04). Adapted: none.
import { encodeMap, type CborEntry } from './cbor';
import {
  encodeScheduleEntry,
  MAX_SCHEDULES,
  validateSchedule,
  type Interval,
  type Schedule,
} from './schedule';

export type MessageChannel = 'command' | 'schedule';
export interface OutgoingMessage {
  mT: number;
  mN: number;
  channel: MessageChannel;
  bytes: Uint8Array;
}

export const MT = {
  setTime: 102,
  setSchedules: 103,
  sprayNow: 104,
  refill: 105,
  stop: 106,
  fetchStatus: 107,
  removeSchedules: 108,
  retrieveSchedules: 109,
  testLed: 113,
} as const;

function build(
  mT: number,
  mN: number,
  channel: MessageChannel,
  extra: CborEntry[] = [],
): OutgoingMessage {
  return { mT, mN, channel, bytes: encodeMap([['mT', mT], ['mN', mN], ...extra]) };
}

export function setTimeMsg(
  mN: number,
  epochSeconds: number,
  tz: { standardOffsetMin: number; dstSavingsMs: number },
): OutgoingMessage {
  return build(MT.setTime, mN, 'command', [
    ['eP', epochSeconds, { uint64: true }],
    ['tZ', -tz.standardOffsetMin],
    ['tD', tz.dstSavingsMs],
  ]);
}

export const sprayNowMsg = (mN: number, interval: 0 | Interval): OutgoingMessage =>
  build(MT.sprayNow, mN, 'command', [['rI', interval]]);

export const stopAutoSprayMsg = (mN: number): OutgoingMessage =>
  build(MT.stop, mN, 'command', [['sS', true]]);

export const refillMsg = (mN: number): OutgoingMessage =>
  build(MT.refill, mN, 'command', [['rR', true]]);

export const fetchStatusMsg = (mN: number): OutgoingMessage => build(MT.fetchStatus, mN, 'command');

export const removeSchedulesMsg = (mN: number): OutgoingMessage =>
  build(MT.removeSchedules, mN, 'command');

export const retrieveSchedulesMsg = (mN: number): OutgoingMessage =>
  build(MT.retrieveSchedules, mN, 'command');

export const testLedMsg = (mN: number): OutgoingMessage => build(MT.testLed, mN, 'command');

export function setSchedulesMsg(mN: number, list: Schedule[]): OutgoingMessage {
  if (list.length > MAX_SCHEDULES) throw new Error(`At most ${MAX_SCHEDULES} schedules`);
  for (const s of list) {
    if (validateSchedule(s).length > 0) throw new Error('Invalid schedule');
  }
  return build(MT.setSchedules, mN, 'schedule', [
    ['S', list.map((s) => ({ s: encodeScheduleEntry(s) }))],
  ]);
}
