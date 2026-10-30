import { magicPacket } from '@/webos/wol';

describe('magicPacket', () => {
  it('is 6 x 0xff then the MAC 16 times', () => {
    const p = magicPacket('aa:bb:cc:00:11:22');
    const mac = [0xaa, 0xbb, 0xcc, 0x00, 0x11, 0x22];
    expect(p).toBeInstanceOf(Uint8Array);
    expect(p).toHaveLength(102);
    expect([...p.slice(0, 6)]).toEqual([255, 255, 255, 255, 255, 255]);
    expect([...p.slice(6, 12)]).toEqual(mac);
    expect([...p.slice(96)]).toEqual(mac);
  });

  it('accepts dashes and upper case', () => {
    expect(magicPacket('AA-BB-CC-00-11-22')).toEqual(magicPacket('aa:bb:cc:00:11:22'));
  });

  it('rejects a bad MAC', () => {
    expect(() => magicPacket('nope')).toThrow(expect.objectContaining({ code: 'unsupported' }));
    expect(() => magicPacket('aa:bb:cc:00:11')).toThrow(
      expect.objectContaining({ code: 'unsupported' }),
    );
  });
});
