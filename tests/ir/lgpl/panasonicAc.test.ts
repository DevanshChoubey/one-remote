import { clampSetpoint, defaultAcState } from '@/core';
import type { AcFan } from '@/core';
import {
  PANASONIC_CAPS,
  panasonicAcBytes,
  panasonicCaps,
  panasonicAcSignal,
  panasonicBytesToSignal,
  panasonicChecksum,
} from '@/ir/lgpl/panasonicAc';
import {
  PANASONIC_EXTRA_FIXTURES,
  PANASONIC_STATE_FIXTURES,
  REAL_CKP_POWERFUL_ON,
  REAL_CKP_QUIET_ON,
  REAL_DKE_ION_ON,
  REAL_DKE_STATE,
  REAL_RKR_SWINGV_MIDDLE,
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

type Model = 'dke' | 'jke' | 'nke' | 'lke' | 'rkr' | 'ckp' | 'unknown';

/** Test-side port of upstream IRPanasonicAc::getModel(), as an oracle independent of setModel. */
function upstreamGetModel(b: Uint8Array): Model {
  if (b[23] === 0x89) return 'rkr';
  if (b[17] === 0x00) {
    if ((b[21] ?? 0) & 0x10 && (b[23] ?? 0) & 0x01) return 'ckp';
    if ((b[23] ?? 0) & 0x80) return 'jke';
  }
  if (b[17] === 0x06 && ((b[13] ?? 0) & 0x0f) === 0x02) return 'lke';
  if (b[23] === 0x01) return 'dke';
  if (b[17] === 0x06) return 'nke';
  return 'unknown';
}

const base = { ...defaultAcState(), power: true, setpoint: 25 };

const changed = (a: Uint8Array, b: Uint8Array): number[] =>
  Array.from(a, (v, i) => (v === b[i] ? -1 : i)).filter((i) => i >= 0);

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

  it('agrees with the upstream SendDataOnly message (JKE-style) on bytes 13 to 17', () => {
    const b = panasonicAcBytes({ ...base, power: false, swing: true }, 'jke');
    for (const i of [13, 14, 15, 16, 17]) expect(b[i]).toBe(REAL_SEND_STATE[i]);
  });

  it('agrees with a real DKE message on the model bytes', () => {
    const b = panasonicAcBytes({ ...base, swing: true }, 'dke');
    for (const i of [14, 16, 23, 25]) expect(b[i]).toBe(REAL_DKE_STATE[i]);
  });

  it('is detected as the right model by the upstream getModel()', () => {
    for (const model of ['dke', 'jke', 'nke', 'lke', 'rkr'] as const) {
      // Upstream's LKE test reads the low nibble of byte 13, which includes the power bit, so a
      // powered-on LKE reads back as NKE upstream. Check with power off.
      for (const swing of [true, false]) {
        const b = panasonicAcBytes({ ...base, power: false, swing }, model);
        expect(upstreamGetModel(b)).toBe(model);
      }
    }
    expect(upstreamGetModel(Uint8Array.from(REAL_JKE_STATE))).toBe('jke');
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

  it.each(PANASONIC_EXTRA_FIXTURES.map((f, i) => [i, f] as const))(
    'extra fixture %i (Powerful, Quiet, ion, swings) matches the reference state',
    (_i, f) => {
      expect(Array.from(panasonicAcBytes(f.state, f.model))).toEqual(f.bytes);
    },
  );

  it('reproduces a real RKR message in full: cool 25, fan Max, vertical middle', () => {
    const s = { ...base, mode: 'cool' as const, setpoint: 25, fan: 5 as const, swing: false };
    expect(Array.from(panasonicAcBytes(s, 'rkr'))).toEqual(REAL_RKR_SWINGV_MIDDLE);
    expect(Array.from(panasonicAcBytes({ ...s, swingV: 3 }, 'rkr'))).toEqual(
      REAL_RKR_SWINGV_MIDDLE,
    );
  });

  it('reproduces the upstream checksum on the real ion and CKP messages', () => {
    for (const real of [REAL_DKE_ION_ON, REAL_CKP_POWERFUL_ON, REAL_CKP_QUIET_ON]) {
      expect(panasonicChecksum(Uint8Array.from(real))).toBe(real[26]);
    }
  });

  it('puts the DKE ion bit where the real remote does: byte 22 bit 0', () => {
    const off = panasonicAcBytes(base, 'dke');
    const on = panasonicAcBytes({ ...base, ion: true }, 'dke');
    expect(changed(off, on)).toEqual([22, 26]);
    expect(on[22]).toBe(REAL_DKE_ION_ON[22]);
    expect((REAL_DKE_ION_ON[22] ?? 0) ^ (REAL_DKE_STATE[22] ?? 0)).toBe(1);
  });

  it('sends ion only on DKE', () => {
    for (const model of ['jke', 'nke', 'lke', 'rkr'] as const) {
      expect(panasonicAcBytes({ ...base, ion: true }, model)).toEqual(
        panasonicAcBytes(base, model),
      );
    }
  });

  it('puts Powerful and Quiet in byte 21: bit 5 and bit 0, swapped on RKR (as the real CKP)', () => {
    const bit = (model: 'dke' | 'rkr', s: object): number =>
      panasonicAcBytes({ ...base, ...s }, model)[21] ?? -1;
    expect(bit('dke', {})).toBe(0);
    expect(bit('dke', { powerful: true })).toBe(0x20);
    expect(bit('dke', { quiet: true })).toBe(0x01);
    // CKP is RKR's bit layout plus the CKP model bit (0x10).
    expect(bit('rkr', { powerful: true })).toBe((REAL_CKP_POWERFUL_ON[21] ?? 0) & ~0x10);
    expect(bit('rkr', { quiet: true })).toBe((REAL_CKP_QUIET_ON[21] ?? 0) & ~0x10);
  });

  it('never sends Powerful and Quiet together: Powerful wins (setPowerful clears Quiet)', () => {
    for (const model of ['dke', 'rkr'] as const) {
      expect(panasonicAcBytes({ ...base, powerful: true, quiet: true }, model)).toEqual(
        panasonicAcBytes({ ...base, powerful: true }, model),
      );
    }
  });

  it('maps the five fan speeds to Min..Max (fan nibble 3..7) and auto to 10', () => {
    const nibble = (fan: AcFan): number =>
      (panasonicAcBytes({ ...base, fan }, 'dke')[16] ?? 0) >> 4;
    expect([1, 2, 3, 4, 5, 'auto'].map((f) => nibble(f as AcFan))).toEqual([3, 4, 5, 6, 7, 10]);
  });

  it('maps the vertical positions to byte 16 low nibble: 1..5, auto 0xF', () => {
    const low = (s: object): number => (panasonicAcBytes({ ...base, ...s }, 'dke')[16] ?? 0) & 0xf;
    expect([1, 2, 3, 4, 5].map((v) => low({ swingV: v }))).toEqual([1, 2, 3, 4, 5]);
    expect(low({ swingV: 'auto' })).toBe(0xf);
    // Old stored states: swing on is auto, off is the middle.
    expect(low({ swing: true })).toBe(0xf);
    expect(low({ swing: false })).toBe(3);
  });

  it('maps the horizontal directions to byte 17 low nibble on DKE and RKR', () => {
    const dirs = ['fullLeft', 'left', 'middle', 'right', 'fullRight', 'auto'] as const;
    for (const model of ['dke', 'rkr'] as const) {
      expect(
        dirs.map((d) => (panasonicAcBytes({ ...base, swingH: d }, model)[17] ?? 0) & 0xf),
      ).toEqual([0x9, 0xa, 0x6, 0xb, 0xc, 0xd]);
    }
    // NKE and LKE are fixed in the middle; JKE has no horizontal swing.
    expect(panasonicAcBytes({ ...base, swingH: 'auto' }, 'nke')[17]).toBe(0x06);
    expect(panasonicAcBytes({ ...base, swingH: 'auto' }, 'lke')[17]).toBe(0x06);
    expect(panasonicAcBytes({ ...base, swingH: 'auto' }, 'jke')[17]).toBe(0x00);
  });

  it('still reads as the right model with every extra on', () => {
    const all = {
      power: false,
      powerful: true,
      ion: true,
      swingV: 1 as const,
      swingH: 'auto' as const,
    };
    for (const model of ['dke', 'jke', 'nke', 'lke', 'rkr'] as const) {
      expect(upstreamGetModel(panasonicAcBytes({ ...base, ...all }, model))).toBe(model);
    }
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

describe('panasonicCaps', () => {
  const common = {
    acModes: ['cool', 'dry', 'fan', 'auto'],
    acFan: ['auto', 1, 2, 3, 4, 5],
    setpoint: { min: 16, max: 30 },
    swing: true,
    swingV: true,
    powerful: true,
    quiet: true,
    sleep: false,
  };

  it('lists the controls every model has', () => {
    expect(PANASONIC_CAPS).toEqual(common);
    for (const model of ['jke', 'nke', 'lke'] as const)
      expect(panasonicCaps(model)).toEqual(common);
  });

  it('adds horizontal swing on DKE and RKR, and ion on DKE only', () => {
    expect(panasonicCaps('dke')).toEqual({ ...common, swingH: true, ion: true });
    expect(panasonicCaps('rkr')).toEqual({ ...common, swingH: true });
  });
});
