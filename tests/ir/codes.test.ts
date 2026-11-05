import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import { acFrames } from '@/ir/catalogue';
import { defaultCatalogue } from '@/ir/codes';
import { necSignal } from '@/ir/nec';

describe('default catalogue', () => {
  const atomberg = defaultCatalogue.remotes('atomberg');

  it('lists the AC brands in alphabetical order, and Atomberg for fans', () => {
    expect(defaultCatalogue.brands('ac').map((b) => b.name)).toEqual([
      'Carrier',
      'Daikin',
      'Haier',
      'Hitachi',
      'LG',
      'Panasonic',
      'Samsung',
      'Whirlpool',
    ]);
    expect(defaultCatalogue.brands('fan').map((b) => b.name)).toEqual(['Atomberg']);
  });

  it('has the five Panasonic remotes with the right ids', () => {
    expect(defaultCatalogue.remotes('panasonic').map((r) => r.id)).toEqual([
      'panasonic-ac/dke',
      'panasonic-ac/jke',
      'panasonic-ac/nke',
      'panasonic-ac/lke',
      'panasonic-ac/rkr',
    ]);
  });

  it('has one Atomberg remote, built from clean NEC frames', () => {
    expect(atomberg.map((r) => r.id)).toEqual(['atomberg-fan/nec']);
    const r = defaultCatalogue.remote('atomberg-fan/nec');
    if (r?.kind !== 'fan') throw new Error('not a fan');
    expect(r.keys).toEqual({
      off: necSignal(0x00cf8976),
      speed1: necSignal(0x00cfd12e),
      speed2: necSignal(0x00cf09f6),
      speed3: necSignal(0x00cf51ae),
      speed4: necSignal(0x00cfc936),
      speed5: necSignal(0x00cf11ee),
      boost: necSignal(0x00cff10e),
      sleep: necSignal(0x00cf718e),
      light: necSignal(0x00cfe916),
    });
    expect(r.caps).toEqual({ fanLight: true, sleep: true, fanBoost: true, fanTimer: false });
  });

  it('has the LG TV NEC remote (not a listed brand)', () => {
    const r = defaultCatalogue.remote('lg-tv/nec');
    if (r?.kind !== 'tv') throw new Error('not a tv');
    expect(r.keys.powerOn).toEqual(necSignal(0x20df23dc));
    expect(r.keys.power).toEqual(necSignal(0x20df10ef));
    expect(r.keys.volumeUp).toEqual(necSignal(0x20df40bf));
    expect(r.keys.volumeDown).toEqual(necSignal(0x20dfc03f));
    expect(r.keys.mute).toEqual(necSignal(0x20df906f));
    expect(defaultCatalogue.brands('ac').concat(defaultCatalogue.brands('fan'))).not.toContainEqual(
      expect.objectContaining({ id: 'lg-tv' }),
    );
  });

  describe('every AC remote', () => {
    const acRemotes = defaultCatalogue
      .brands('ac')
      .flatMap((b) => defaultCatalogue.remotes(b.id))
      .filter((r) => r.kind === 'ac');
    const states: AcState[] = [];
    for (const power of [true, false])
      for (const mode of ['cool', 'dry', 'fan', 'auto'] as const)
        for (const fan of ['auto', 1, 2, 3] as const)
          for (const swing of [true, false])
            for (const setpoint of [10, 16, 24, 31])
              states.push({ power, mode, fan, swing, setpoint, sleep: swing && fan === 2 });

    it('has a unique id prefixed by its brand family, a label and a setpoint range', () => {
      const ids = acRemotes.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of acRemotes) {
        expect(r.label.length).toBeGreaterThan(0);
        if (r.kind !== 'ac') continue;
        expect(r.caps.setpoint).toBeDefined();
        expect(r.caps.acModes?.length).toBeGreaterThan(0);
      }
    });

    it.each(acRemotes.map((r) => [r.id, r] as const))(
      '%s encodes every state, with and without prev, to valid frames',
      (_id, r) => {
        if (r.kind !== 'ac') throw new Error('not an ac');
        for (const s of states) {
          for (const prev of [undefined, defaultAcState(), { ...s, swing: !s.swing }]) {
            const frames = acFrames(r, s, prev);
            expect(frames.length).toBeGreaterThan(0);
            for (const f of frames) {
              expect(f.freqHz).toBeGreaterThanOrEqual(30000);
              expect(f.freqHz).toBeLessThanOrEqual(60000);
              expect(f.pattern.length % 2).toBe(0);
              expect(f.pattern.every((us) => Number.isInteger(us) && us > 0)).toBe(true);
              // Android's ConsumerIrManager refuses patterns longer than two seconds.
              expect(f.pattern.reduce((a, b) => a + b, 0)).toBeLessThan(2_000_000);
            }
          }
        }
      },
    );
  });
});
