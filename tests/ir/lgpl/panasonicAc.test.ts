import { clampSetpoint, defaultAcState } from '@/core';
import {
  PANASONIC_CAPS,
  panasonicAcBytes,
  panasonicAcSignal,
  panasonicBytesToSignal,
  panasonicChecksum,
} from '@/ir/lgpl/panasonicAc';
import {
  PANASONIC_STATE_FIXTURES,
  REAL_DKE_STATE,
  REAL_JKE_STATE,
  REAL_SEND_STATE,
  REAL_SEND_TIMING,
} from './panasonicAc.fixtures';

function parseTiming(s: string): { freq: number; pattern: number[] } {
  const m = /^f(\d+)d(\d+)(.*)$/.exec(s);
  if (!m) throw new Error('bad timing string');
  const pattern = [...(m[3] ?? '').matchAll(/[ms](\d+)/g)].map((x) => Number(x[1]));
  return { freq: Number(m[1]), pattern };
}

const base = { ...defaultAcState(), power: true, setpoint: 25 };

describe('panasonicAcBytes', () => {
  it.each(PANASONIC_STATE_FIXTURES.map((f, i) => [i, f] as const))(
    'fixture %i matches the reference state',
    (_i, f) => {
      expect(Array.from(panasonicAcBytes(f.state, f.model))).toEqual(f.bytes);
    },
  );

  it('is 27 bytes with the upstream checksum rule (byte 26)', () => {
    for (const f of PANASONIC_STATE_FIXTURES) {
      const b = panasonicAcBytes(f.state, f.model);
      expect(b).toHaveLength(27);
      expect(b[26]).toBe(panasonicChecksum(b));
    }
  });

  it('reproduces the upstream checksum on real remote messages', () => {
    for (const real of [REAL_SEND_STATE, REAL_JKE_STATE, REAL_DKE_STATE]) {
      expect(panasonicChecksum(Uint8Array.from(real))).toBe(real[26]);
    }
  });

  it('agrees with a real JKE message on the mode, temp and fan/swing bytes', () => {
    const b = panasonicAcBytes({ ...base, power: false, swing: true }, 'jke');
    for (const i of [13, 14, 15, 16, 17]) expect(b[i]).toBe(REAL_SEND_STATE[i]);
  });

  it('agrees with a real DKE message on the model bytes', () => {
    const b = panasonicAcBytes({ ...base, swing: true }, 'dke');
    for (const i of [14, 16, 23, 25]) expect(b[i]).toBe(REAL_DKE_STATE[i]);
  });

  it('power:false changes only the power bit and the checksum', () => {
    const on = panasonicAcBytes(base, 'dke');
    const off = panasonicAcBytes({ ...base, power: false }, 'dke');
    const diff = Array.from(on, (v, i) => (v === off[i] ? -1 : i)).filter((i) => i >= 0);
    expect(diff).toEqual([13, 26]);
    expect((on[13] ?? 0) ^ (off[13] ?? 0)).toBe(1);
  });

  it('clamps the setpoint to 16..30', () => {
    expect(clampSetpoint(31, PANASONIC_CAPS)).toBe(30);
    expect(clampSetpoint(15, PANASONIC_CAPS)).toBe(16);
    expect(panasonicAcBytes({ ...base, setpoint: 31 }, 'jke')).toEqual(
      panasonicAcBytes({ ...base, setpoint: 30 }, 'jke'),
    );
    expect(panasonicAcBytes({ ...base, setpoint: 15 }, 'jke')).toEqual(
      panasonicAcBytes({ ...base, setpoint: 16 }, 'jke'),
    );
  });

  it('ignores sleep', () => {
    expect(panasonicAcBytes({ ...base, sleep: true }, 'nke')).toEqual(
      panasonicAcBytes(base, 'nke'),
    );
  });
});

describe('panasonicAcSignal', () => {
  it('matches the upstream timing string for the upstream state', () => {
    const ref = parseTiming(REAL_SEND_TIMING);
    const s = panasonicBytesToSignal(Uint8Array.from(REAL_SEND_STATE));
    expect(s.freqHz).toBe(36700);
    expect(ref.freq).toBe(36700);
    expect(s.pattern).toEqual(ref.pattern);
  });

  it('encodes the fixture states: even length, section gap 10000, message gap 100000', () => {
    for (const f of PANASONIC_STATE_FIXTURES) {
      const s = panasonicAcSignal(f.state, f.model);
      expect(s.freqHz).toBe(36700);
      expect(s.pattern.length % 2).toBe(0);
      expect(s.pattern).toEqual(panasonicBytesToSignal(Uint8Array.from(f.bytes)).pattern);
      expect(s.pattern).toContain(10000);
      expect(s.pattern[s.pattern.length - 1]).toBe(100000);
    }
  });
});

describe('PANASONIC_CAPS', () => {
  it('lists the supported controls', () => {
    expect(PANASONIC_CAPS).toEqual({
      acModes: ['cool', 'dry', 'fan', 'auto'],
      acFan: ['auto', 1, 2, 3],
      setpoint: { min: 16, max: 30 },
      swing: true,
      sleep: false,
    });
  });
});
