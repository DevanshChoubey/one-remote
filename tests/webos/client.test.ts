import { DeviceError } from '@/core';
import { SsapClient, SsapReplyError } from '@/webos/client';
import { URI } from '@/webos/ssap';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';

const HOST = '192.168.1.23';
const MAC = 'aa:bb:cc:00:11:22';

async function setup(opts: { prompt?: 'allow' | 'deny' | 'never' } = {}) {
  const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], ...opts });
  const lan = createFakeLan({ tvs: [tv] });
  const client = await SsapClient.connect(lan, { host: HOST, secure: false }, 1500);
  return { tv, lan, client };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('SsapClient', () => {
  it('registers with a known key and resolves it', async () => {
    const { client } = await setup();
    const onPrompt = jest.fn();
    await expect(client.register('k', onPrompt, 1000)).resolves.toBe('k');
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('calls onPrompt and resolves the new key', async () => {
    const { client } = await setup();
    const onPrompt = jest.fn();
    const key = await client.register(undefined, onPrompt, 1000);
    expect(key).toMatch(/^fake-key-/);
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('rejects notPaired when the TV says no', async () => {
    const { client } = await setup({ prompt: 'deny' });
    await expect(client.register(undefined, jest.fn(), 1000)).rejects.toMatchObject({
      code: 'notPaired',
      message: '403 User denied access',
    });
  });

  it('retries without the signature when the TV blacklists the signed manifest', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], rejectSigned: true });
    const client = await SsapClient.connect(
      createFakeLan({ tvs: [tv] }),
      { host: HOST, secure: false },
      1500,
    );
    const onPrompt = jest.fn();
    await expect(client.register(undefined, onPrompt, 1000)).resolves.toMatch(/^fake-key-/);
    expect(onPrompt).toHaveBeenCalledTimes(1);
    const regs = tv.frames.filter((f) => f.type === 'register');
    expect(regs).toHaveLength(2);
    expect(JSON.stringify(regs[0])).toContain('signatures');
    expect(JSON.stringify(regs[1])).not.toContain('signatures');
    expect(JSON.stringify(regs[1])).not.toContain('"signed"');
    expect(JSON.stringify(regs[1])).toContain('CONTROL_POWER');
    // The signed block held the pointer and text permissions: the unsigned manifest must carry them.
    const unsigned = regs[1] as { payload: { manifest: { permissions: string[] } } };
    expect(unsigned.payload.manifest.permissions).toEqual(
      expect.arrayContaining(['CONTROL_MOUSE_AND_KEYBOARD', 'CONTROL_INPUT_TEXT', 'CONTROL_POWER']),
    );
    expect(new Set(unsigned.payload.manifest.permissions).size).toBe(
      unsigned.payload.manifest.permissions.length,
    );
  });

  it('reconnects with a known key on a TV that blacklists the signed manifest', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], rejectSigned: true });
    const client = await SsapClient.connect(
      createFakeLan({ tvs: [tv] }),
      { host: HOST, secure: false },
      1500,
    );
    await expect(client.register('k', jest.fn(), 1000)).resolves.toBe('k');
  });

  it('does not retry any other refusal', async () => {
    const { tv, client } = await setup({ prompt: 'deny' });
    await expect(client.register(undefined, jest.fn(), 1000)).rejects.toMatchObject({
      code: 'notPaired',
    });
    expect(tv.frames.filter((f) => f.type === 'register')).toHaveLength(1);
  });

  it('request resolves the matching reply only', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    tv.setVolume(7);
    const [vol, power] = await Promise.all([client.request(URI.volume), client.request(URI.power)]);
    expect(vol).toMatchObject({ volumeStatus: { volume: 7 } });
    expect(power).toMatchObject({ state: 'Active' });
  });

  it('an error reply rejects notSent with the error text', async () => {
    const { client } = await setup();
    await client.register('k', jest.fn(), 1000);
    await expect(client.request('ssap://nope')).rejects.toMatchObject({
      code: 'notSent',
      message: '404 no such service or method',
    });
  });

  it('subscribe delivers every update until unsubscribed', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    const seen: unknown[] = [];
    const unsub = client.subscribe(URI.volume, (p) => seen.push(p));
    await settle();
    seen.length = 0;
    tv.setVolume(10);
    tv.setVolume(11);
    await settle();
    expect(seen).toHaveLength(2);
    unsub();
    tv.setVolume(12);
    await settle();
    expect(seen).toHaveLength(2);
    expect(tv.frames.filter((f) => f.type === 'unsubscribe')).toHaveLength(1);
  });

  it('button reuses one pointer socket', async () => {
    const { client, tv, lan } = await setup();
    await client.register('k', jest.fn(), 1000);
    await client.button('UP');
    await client.button('UP');
    await client.button('ENTER');
    expect(tv.buttons).toEqual(['UP', 'UP', 'ENTER']);
    expect(tv.requests.filter((r) => r.uri === URI.pointer)).toHaveLength(1);
    expect(lan.opened.filter((u) => u.includes('pointer'))).toHaveLength(1);
  });

  it('two presses at once share the one pointer socket', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    await Promise.all([client.button('UP'), client.button('DOWN')]);
    expect(tv.buttons).toEqual(['UP', 'DOWN']);
    expect(tv.requests.filter((r) => r.uri === URI.pointer)).toHaveLength(1);
  });

  it('refuses presses after the TV drops the connection', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    await client.button('UP');
    const closed = jest.fn();
    client.onClose(closed);
    tv.drop();
    expect(closed).toHaveBeenCalledTimes(1);
    await expect(client.button('UP')).rejects.toMatchObject({ code: 'notSent' });
  });

  it('close rejects what is pending and does not fire onClose', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    tv.stopAnswering();
    const closed = jest.fn();
    client.onClose(closed);
    const p = client.request(URI.volume);
    client.close();
    // the frame was written, so the TV may have acted on it
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
    await expect(client.request(URI.volume)).rejects.toMatchObject({ code: 'notSent' });
    expect(closed).not.toHaveBeenCalled();
  });
});

describe('SsapClient timeouts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('request times out after 1500 ms by default', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    tv.stopAnswering();
    let err: unknown;
    client.request(URI.volume).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(1499);
    expect(err).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(err).toBeInstanceOf(DeviceError);
    expect((err as DeviceError).code).toBe('timeout');
  });

  it('a press that outlives its budget is never written', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    tv.stopAnswering();
    let err: unknown;
    client.button('UP', 500).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(500);
    expect((err as DeviceError).code).toBe('notSent');
    expect(tv.buttons).toEqual([]);
  });

  it('register times out', async () => {
    const { client } = await setup({ prompt: 'never' });
    let err: unknown;
    client.register(undefined, jest.fn(), 60000).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(60000);
    expect((err as DeviceError).code).toBe('timeout');
  });
});

describe('SsapClient: written requests and pointer host', () => {
  it('a request whose frame was written rejects timeout when the TV drops before replying', async () => {
    const { client, tv } = await setup();
    await client.register('k', jest.fn(), 1000);
    const p = client.request(URI.turnOff);
    expect(tv.requests.map((r) => r.uri)).toContain(URI.turnOff);
    tv.drop();
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
  });

  it('a TV error reply is notSent and marks the link alive', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], failUris: [URI.volume] });
    const lan = createFakeLan({ tvs: [tv] });
    const client = await SsapClient.connect(lan, { host: HOST, secure: false }, 1500);
    await client.register('k', jest.fn(), 1000);
    const err = await client.request(URI.volume).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SsapReplyError);
    expect((err as SsapReplyError).code).toBe('notSent');
  });

  it('refuses a pointer socket that is not on the TV', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], socketHost: '192.168.1.99' });
    const lan = createFakeLan({ tvs: [tv] });
    const client = await SsapClient.connect(lan, { host: HOST, secure: false }, 1500);
    await client.register('k', jest.fn(), 1000);
    await expect(client.button('UP')).rejects.toMatchObject({ code: 'notSent' });
    expect(lan.opened.some((u) => u.includes('192.168.1.99'))).toBe(false);
  });

  it('a pointer-socket request that times out is notSent for the press: no button frame was written', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, knownKeys: ['k'], dropOn: URI.pointer });
    const lan = createFakeLan({ tvs: [tv] });
    const client = await SsapClient.connect(lan, { host: HOST, secure: false }, 1500);
    await client.register('k', jest.fn(), 1000);
    await expect(client.button('UP')).rejects.toMatchObject({ code: 'notSent' });
    expect(tv.buttons).toEqual([]);
  });
});
