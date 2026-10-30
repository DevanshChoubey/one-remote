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

  it('has the two Atomberg SmartIR files', () => {
    expect(atomberg.map((r) => r.id)).toEqual(['atomberg-fan/1160', 'atomberg-fan/1170']);
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
    for (const key of ['off', 'speed1', 'speed2', 'speed3', 'speed4', 'speed5'] as const) {
      expect({ id, key, present: r.keys[key] !== undefined }).toEqual({ id, key, present: true });
    }
    expect(r.caps).toEqual({ fanLight: false, sleep: false });
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
