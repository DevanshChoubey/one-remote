// From aer-remote tests/protocol/messages.test.ts (2026-11-04). Adapted: imports now use @/aer/protocol.
import { decodeFirst } from '@/aer/protocol/cbor';
import {
  fetchStatusMsg,
  MT,
  refillMsg,
  removeSchedulesMsg,
  retrieveSchedulesMsg,
  setSchedulesMsg,
  setTimeMsg,
  sprayNowMsg,
  stopAutoSprayMsg,
  testLedMsg,
} from '@/aer/protocol/messages';
import type { Schedule } from '@/aer/protocol/schedule';

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const sched: Schedule = {
  start: { h: 8, m: 0 },
  end: { h: 22, m: 0 },
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  interval: 20,
};

describe('messages', () => {
  it('builds spray now', () => {
    const m = sprayNowMsg(154, 0);
    expect(hex(m.bytes)).toBe('bf626d541868626d4e189a62724900ff');
    expect(m.channel).toBe('command');
    expect(m.mT).toBe(104);
    expect(m.mN).toBe(154);
  });

  it('builds set schedules on the schedule channel', () => {
    const m = setSchedulesMsg(5, [sched]);
    expect(m.channel).toBe('schedule');
    const d = decodeFirst(m.bytes)?.value as { S: { s: Uint8Array }[] };
    expect(Array.from(d.S[0]?.s ?? [])).toEqual([0x7c, 8, 0, 42, 20]);
  });

  it('rejects too many or invalid schedules', () => {
    expect(() =>
      setSchedulesMsg(
        5,
        Array.from({ length: 11 }, () => sched),
      ),
    ).toThrow();
    expect(() => setSchedulesMsg(5, [{ ...sched, days: [] }])).toThrow();
  });

  it('builds set time with a uint64 eP and negated tZ', () => {
    const m = setTimeMsg(152, 1761500000, { standardOffsetMin: 330, dstSavingsMs: 0 });
    expect(hex(m.bytes)).toContain('1b0000000068fe5b60');
    expect(decodeFirst(m.bytes)?.value).toEqual({
      mT: 102,
      mN: 152,
      eP: 1761500000,
      tZ: -330,
      tD: 0,
    });
    expect(Object.keys(decodeFirst(m.bytes)?.value as object)).toEqual([
      'mT',
      'mN',
      'eP',
      'tZ',
      'tD',
    ]);
  });

  it('builds the simple commands', () => {
    expect(decodeFirst(stopAutoSprayMsg(1).bytes)?.value).toEqual({ mT: 106, mN: 1, sS: true });
    expect(decodeFirst(refillMsg(2).bytes)?.value).toEqual({ mT: 105, mN: 2, rR: true });
    expect(decodeFirst(fetchStatusMsg(3).bytes)?.value).toEqual({ mT: 107, mN: 3 });
    expect(decodeFirst(removeSchedulesMsg(4).bytes)?.value).toEqual({ mT: 108, mN: 4 });
    expect(decodeFirst(retrieveSchedulesMsg(5).bytes)?.value).toEqual({ mT: 109, mN: 5 });
    expect(decodeFirst(testLedMsg(6).bytes)?.value).toEqual({ mT: 113, mN: 6 });
    expect(MT.testLed).toBe(113);
    expect(fetchStatusMsg(3).channel).toBe('command');
  });
});
