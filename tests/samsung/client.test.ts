import { SamsungClient } from '@/samsung/client';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';

const HOST = '192.168.1.40';
const MAC = 'aa:bb:cc:dd:ee:ff';

function setup(opts: Partial<Parameters<typeof createFakeSamsungTv>[0]> = {}) {
  const tv = createFakeSamsungTv({ host: HOST, mac: MAC, ...opts });
  return { tv, lan: createFakeSamsungLan([tv]) };
}

describe('SamsungClient', () => {
  it('ready resolves the token the TV sends', async () => {
    const { lan } = setup({ prompt: 'allow' });
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    await expect(c.ready(1000)).resolves.toBe('12345678');
    c.close();
  });

  it('ready resolves an empty token for a TV that sends none', async () => {
    const { lan } = setup({ prompt: 'allow', noToken: true });
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    await expect(c.ready(1000)).resolves.toBe('');
  });

  it('a known token and pin connect at once', async () => {
    const { tv, lan } = setup();
    const c = await SamsungClient.connect(
      lan,
      { host: HOST, token: '12345678', pinSha256: tv.certSha256 },
      1000,
    );
    await expect(c.ready(1000)).resolves.toBe('12345678');
    c.key('KEY_HOME');
    c.text('hi');
    expect(tv.keys).toEqual(['KEY_HOME']);
    expect(tv.texts).toEqual(['hi']);
    expect(c.certSha256).toBe(tv.certSha256);
  });

  it('rejects notPaired after deny()', async () => {
    const { tv, lan } = setup();
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    const r = c.ready(1000);
    tv.deny();
    await expect(r).rejects.toMatchObject({ code: 'notPaired' });
  });

  it('rejects timeout when the TV stays quiet', async () => {
    jest.useFakeTimers();
    try {
      const { tv, lan } = setup();
      tv.stayQuiet(true);
      const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
      const r = c.ready(5000);
      const assertion = expect(r).rejects.toMatchObject({ code: 'timeout' });
      jest.advanceTimersByTime(5000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects notSent when the socket closes before the answer', async () => {
    const { tv, lan } = setup();
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    const r = c.ready(1000);
    tv.drop();
    await expect(r).rejects.toMatchObject({ code: 'notSent' });
  });

  it('key and text throw notSent after the TV drops the socket, and onClose fires', async () => {
    const { tv, lan } = setup({ prompt: 'allow' });
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    const closed = jest.fn();
    c.onClose(closed);
    tv.drop();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(() => c.key('KEY_UP')).toThrow(expect.objectContaining({ code: 'notSent' }));
    expect(() => c.text('x')).toThrow(expect.objectContaining({ code: 'notSent' }));
  });

  it('own close() does not fire onClose', async () => {
    const { lan } = setup({ prompt: 'allow' });
    const c = await SamsungClient.connect(lan, { host: HOST, pairing: true }, 1000);
    const closed = jest.fn();
    c.onClose(closed);
    c.close();
    expect(closed).not.toHaveBeenCalled();
  });

  it('a wrong pin rejects notPaired from connect', async () => {
    const { lan } = setup();
    await expect(
      SamsungClient.connect(lan, { host: HOST, pinSha256: 'other' }, 1000),
    ).rejects.toMatchObject({ code: 'notPaired' });
  });

  it('certSha256 is the pin passed in', async () => {
    const { tv, lan } = setup();
    const c = await SamsungClient.connect(lan, { host: HOST, pinSha256: tv.certSha256 }, 1000);
    expect(c.certSha256).toBe(tv.certSha256);
  });
});
