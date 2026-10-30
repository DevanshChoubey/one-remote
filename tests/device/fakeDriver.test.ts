import type { Command, Device, Link, Reported } from '@/core';
import { DeviceError } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';

const link: Link = { kind: 'matter', nodeId: 'n1' };
const mkDevice = (id: string): Device => ({
  id,
  kind: 'fan',
  name: id,
  roomId: 'r',
  order: 0,
  links: [link],
});
const cmd: Command = { kind: 'tv.key', key: 'ok' };
const reported: Reported = {
  kind: 'tv',
  state: { power: true },
};

describe('createFakeDriver', () => {
  it('records sends', async () => {
    const d = createFakeDriver('matter');
    await d.send(mkDevice('a'), link, cmd);
    expect(d.sent).toEqual([{ deviceId: 'a', cmd }]);
    expect(d.kind).toBe('matter');
  });

  it('failNext rejects once, is not recorded, then succeeds', async () => {
    const d = createFakeDriver('matter');
    d.failNext('notSent');
    const err = await d.send(mkDevice('a'), link, cmd).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeviceError);
    expect((err as DeviceError).code).toBe('notSent');
    expect(d.sent).toHaveLength(0);
    await d.send(mkDevice('a'), link, cmd);
    expect(d.sent).toHaveLength(1);
  });

  it('hangNext never settles and is not recorded; next send works', async () => {
    const d = createFakeDriver('matter');
    d.hangNext();
    let settled = false;
    void d.send(mkDevice('a'), link, cmd).then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBe(false);
    expect(d.sent).toHaveLength(0);
    await d.send(mkDevice('a'), link, cmd);
    expect(d.sent).toHaveLength(1);
  });

  it('emit reaches only observers of that device, and unsubscribe stops it', () => {
    const d = createFakeDriver('webos');
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = d.observe?.(mkDevice('a'), link, a);
    d.observe?.(mkDevice('b'), link, b);
    d.emit('a', reported);
    expect(a).toHaveBeenCalledWith(reported);
    expect(b).not.toHaveBeenCalled();
    unsubA?.();
    d.emit('a', reported);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('available defaults true, honours opts and setAvailable', () => {
    expect(createFakeDriver('ir').available()).toBe(true);
    const d = createFakeDriver('ir', { available: false });
    expect(d.available()).toBe(false);
    d.setAvailable(true);
    expect(d.available()).toBe(true);
  });

  it('supports and capabilities have defaults and overrides', () => {
    const d = createFakeDriver('ir');
    expect(d.supports(mkDevice('a'), link, cmd)).toBe(true);
    expect(d.capabilities(mkDevice('a'), link)).toEqual({});
    const caps = { swing: true };
    const e = createFakeDriver('ir', { supports: (c) => c.kind === 'tv.text', capabilities: caps });
    expect(e.supports(mkDevice('a'), link, cmd)).toBe(false);
    expect(e.capabilities(mkDevice('a'), link)).toBe(caps);
  });
});
