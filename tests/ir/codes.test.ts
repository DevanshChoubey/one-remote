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
      expect.objectContaining({ id: 'lg' }),
    );
  });
});
