import { defaultCatalogue } from '@/ir/codes';
import { necSignal } from '@/ir/nec';

describe('default catalogue', () => {
  const atomberg = defaultCatalogue.remotes('atomberg');

  it('lists Panasonic for AC and Atomberg for fans', () => {
    expect(defaultCatalogue.brands('ac').map((b) => b.name)).toEqual(['Panasonic']);
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

  it('has the two Atomberg files, 1170 first in candidate order', () => {
    expect(atomberg.map((r) => r.id)).toEqual(['atomberg-fan/1170', 'atomberg-fan/1160']);
  });

  it.each(['atomberg-fan/1160', 'atomberg-fan/1170'])('%s decodes cleanly', (id) => {
    const r = defaultCatalogue.remote(id);
    if (r?.kind !== 'fan') throw new Error('not a fan');
    expect(Object.keys(r.keys).length).toBeGreaterThan(0);
    for (const s of Object.values(r.keys)) {
      expect(s.freqHz).toBe(38000);
      expect(s.pattern.length % 2).toBe(0);
      expect(s.pattern.length).toBeGreaterThan(0);
    }
  });

  it.each(['atomberg-fan/1160', 'atomberg-fan/1170'])('%s has no duplicate codes', (id) => {
    const r = defaultCatalogue.remote(id);
    if (r?.kind !== 'fan') throw new Error('not a fan');
    const seen = new Map<string, string>();
    for (const [key, s] of Object.entries(r.keys)) {
      const sig = JSON.stringify(s);
      expect({ key, sameAs: seen.get(sig) }).toEqual({ key, sameAs: undefined });
      seen.set(sig, key);
    }
  });

  it('1170 has off and speed1 to speed5', () => {
    const r = defaultCatalogue.remote('atomberg-fan/1170');
    if (r?.kind !== 'fan') throw new Error('not a fan');
    for (const key of ['off', 'speed1', 'speed2', 'speed3', 'speed4', 'speed5'] as const) {
      expect({ key, present: r.keys[key] !== undefined }).toEqual({ key, present: true });
    }
  });

  it('1160 lacks speed3 (identical to speed2 in the source): the spike gate applies', () => {
    const r = defaultCatalogue.remote('atomberg-fan/1160');
    if (r?.kind !== 'fan') throw new Error('not a fan');
    expect(r.keys.speed3).toBeUndefined();
    for (const key of ['off', 'speed1', 'speed2', 'speed4', 'speed5'] as const) {
      expect(r.keys[key]).toBeDefined();
    }
  });

  it('sets fan caps from the keys present: no light, sleep or timer; boost only on 1160', () => {
    const caps = (id: string) => {
      const r = defaultCatalogue.remote(id);
      if (r?.kind !== 'fan') throw new Error('not a fan');
      return r.caps;
    };
    expect(caps('atomberg-fan/1170')).toEqual({
      fanLight: false,
      sleep: false,
      fanBoost: false,
      fanTimer: false,
    });
    expect(caps('atomberg-fan/1160')).toEqual({
      fanLight: false,
      sleep: false,
      fanBoost: true,
      fanTimer: false,
    });
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
      expect.objectContaining({ id: 'lg' }),
    );
  });
});
