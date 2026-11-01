import { DeviceError, PairError, type Device, type FoundTv, type TvLink } from '@/core';
import type { BrandSetup } from '@/tv/brands';
import { createCompositeTvSetup } from '@/tv/setup';
import type { TvTransport } from '@/tv/transport';
import { createWebosBrand } from '@/webos/setup';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';

type OnOpen = (host: string, port: number) => void;
type OnHost = (host: string, openPorts: number[]) => void;

function fakeBrand(
  kind: 'webos' | 'androidtv',
  ports: number[],
): BrandSetup & {
  emit: (tv: FoundTv) => void;
  fromProbe: jest.Mock;
  pair: jest.Mock;
  probeHost: jest.Mock;
  findAgain: jest.Mock;
} {
  let cb: (tv: FoundTv) => void = () => undefined;
  return {
    kind,
    labelKey: `addTv.brand.${kind}`,
    pairing: 'allow',
    probePorts: ports,
    discover: (onFound) => {
      cb = onFound;
      return () => undefined;
    },
    emit: (tv) => cb(tv),
    fromProbe: jest.fn((host: string, open: ReadonlySet<number>) =>
      open.size > 0 ? { kind, host, name: kind, secure: false } : null,
    ),
    probeHost: jest.fn(async () => null),
    pair: jest.fn(async (tv: FoundTv) => ({
      link: { kind: tv.kind, host: tv.host } as unknown as TvLink,
      suggestedName: tv.name,
    })),
    findAgain: jest.fn(async () => '10.0.0.9'),
  };
}

function fakeProbe(hits: [string, number][]) {
  const probe = jest.fn(
    async (_ports: number[], _ms: number, onOpen: OnOpen, _c?: () => boolean, onHost?: OnHost) => {
      const byHost = new Map<string, number[]>();
      for (const [h, p] of hits) {
        onOpen(h, p);
        byHost.set(h, [...(byHost.get(h) ?? []), p]);
      }
      for (const [h, ps] of byHost) onHost?.(h, ps);
    },
  );
  return { probe } as Pick<TvTransport, 'probe'> & { probe: jest.Mock };
}

const tv = (kind: 'webos' | 'androidtv', host: string, secure = false): FoundTv => ({
  kind,
  host,
  name: kind,
  secure,
});
const prompts = { onAllow: () => undefined, askCode: async () => null };

describe('createCompositeTvSetup', () => {
  it('replaces a later-brand hit with an earlier brand on the same host', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const transport = fakeProbe([['10.0.0.5', 3000]]);
    const found: FoundTv[] = [];
    createCompositeTvSetup({ brands: [a, b], transport }).discover((t) => found.push(t));
    b.emit(tv('androidtv', '10.0.0.5'));
    await new Promise((r) => setTimeout(r, 0));
    expect(found.map((f) => f.kind)).toEqual(['androidtv', 'webos']);
  });

  it('reports once when the earlier brand hit first', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const transport = fakeProbe([['10.0.0.5', 6466]]);
    const found: FoundTv[] = [];
    createCompositeTvSetup({ brands: [a, b], transport }).discover((t) => found.push(t));
    a.emit(tv('webos', '10.0.0.5'));
    await new Promise((r) => setTimeout(r, 0));
    expect(found.map((f) => f.kind)).toEqual(['webos']);
  });

  it('reports the same brand again when the probe shows it secure', async () => {
    const a = fakeBrand('webos', [3000, 3001]);
    a.fromProbe.mockImplementation((host: string) => ({ ...tv('webos', host), secure: true }));
    const transport = fakeProbe([['10.0.0.5', 3001]]);
    const found: FoundTv[] = [];
    createCompositeTvSetup({ brands: [a], transport }).discover((t) => found.push(t));
    a.emit(tv('webos', '10.0.0.5'));
    await new Promise((r) => setTimeout(r, 0));
    expect(found.map((f) => f.secure)).toEqual([false, true]);
  });

  it('probes once with the union of ports and gives each brand only its own', async () => {
    const a = fakeBrand('webos', [3000, 3001]);
    const b = fakeBrand('androidtv', [6466, 3000]);
    const transport = fakeProbe([
      ['10.0.0.5', 3000],
      ['10.0.0.5', 6466],
    ]);
    createCompositeTvSetup({ brands: [a, b], transport, probeMs: 700 }).discover(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.probe).toHaveBeenCalledTimes(1);
    expect([...transport.probe.mock.calls[0][0]].sort()).toEqual([3000, 3001, 6466]);
    expect(transport.probe.mock.calls[0][1]).toBe(700);
    expect([...(a.fromProbe.mock.calls[0][1] as Set<number>)]).toEqual([3000]);
    expect([...(b.fromProbe.mock.calls[0][1] as Set<number>)].sort()).toEqual([3000, 6466]);
  });

  it('does not offer a brand ports it did not ask for', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const transport = fakeProbe([['10.0.0.5', 6466]]);
    createCompositeTvSetup({ brands: [a, b], transport }).discover(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(a.fromProbe).not.toHaveBeenCalled();
    expect([...(b.fromProbe.mock.calls[0][1] as Set<number>)]).toEqual([6466]);
  });

  it('stops reporting after unsubscribe', async () => {
    const a = fakeBrand('webos', [3000]);
    const transport = fakeProbe([['10.0.0.5', 3000]]);
    const found: FoundTv[] = [];
    const stop = createCompositeTvSetup({ brands: [a], transport }).discover((t) => found.push(t));
    stop();
    a.emit(tv('webos', '10.0.0.6'));
    await new Promise((r) => setTimeout(r, 0));
    expect(found).toEqual([]);
  });

  it('pairs with the brand of tv.kind, and fails for an unknown kind', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const setup = createCompositeTvSetup({ brands: [a, b], transport: fakeProbe([]) });
    await setup.pair(tv('androidtv', '10.0.0.5'), prompts);
    expect(b.pair).toHaveBeenCalledTimes(1);
    expect(a.pair).not.toHaveBeenCalled();
    await expect(setup.pair(tv('webos', 'x'), prompts)).resolves.toBeDefined();
    const only = createCompositeTvSetup({ brands: [b], transport: fakeProbe([]) });
    await expect(only.pair(tv('webos', 'x'), prompts)).rejects.toBeInstanceOf(PairError);
  });

  it('findAgain goes to the brand of the device link, else null', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const setup = createCompositeTvSetup({ brands: [a, b], transport: fakeProbe([]) });
    const link = { kind: 'androidtv', host: '1.1.1.1' } as unknown as TvLink;
    const device = { id: 'd', name: 'TV', links: [link] } as unknown as Device;
    await expect(setup.findAgain(device)).resolves.toBe('10.0.0.9');
    expect(b.findAgain).toHaveBeenCalledWith(device, link);
    const none = { id: 'e', name: 'x', links: [] } as unknown as Device;
    await expect(setup.findAgain(none)).resolves.toBeNull();
  });

  it('probeHost returns the first hit in order and rethrows notLocal', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    b.probeHost.mockResolvedValue(tv('androidtv', 'h'));
    const setup = createCompositeTvSetup({ brands: [a, b], transport: fakeProbe([]) });
    await expect(setup.probeHost('h')).resolves.toEqual(tv('androidtv', 'h'));
    a.probeHost.mockRejectedValue(new DeviceError('notLocal'));
    await expect(setup.probeHost('h')).rejects.toMatchObject({ code: 'notLocal' });
    expect(b.probeHost).toHaveBeenCalledTimes(1);
  });

  it('passes frames through as onFrame', () => {
    const frames = { subscribe: jest.fn(() => () => undefined) };
    const setup = createCompositeTvSetup({ brands: [], transport: fakeProbe([]), frames });
    setup.onFrame?.(() => undefined);
    expect(frames.subscribe).toHaveBeenCalled();
    expect(
      createCompositeTvSetup({ brands: [], transport: fakeProbe([]) }).onFrame,
    ).toBeUndefined();
  });
});

describe('composite hardening', () => {
  it('keeps reporting other brands when one fromProbe throws', async () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    a.fromProbe.mockImplementation(() => {
      throw new Error('boom');
    });
    const transport = fakeProbe([
      ['10.0.0.5', 3000],
      ['10.0.0.5', 6466],
      ['10.0.0.6', 3000],
    ]);
    const found: FoundTv[] = [];
    createCompositeTvSetup({ brands: [a, b], transport }).discover((t) => found.push(t));
    await new Promise((r) => setTimeout(r, 0));
    expect(found.map((f) => `${f.kind}@${f.host}`)).toEqual(['androidtv@10.0.0.5']);
    expect(a.fromProbe).toHaveBeenCalledTimes(2);
  });

  it('stops every brand even when one stop throws', () => {
    const a = fakeBrand('webos', [3000]);
    const b = fakeBrand('androidtv', [6466]);
    const stopB = jest.fn();
    a.discover = () => () => {
      throw new Error('boom');
    };
    b.discover = () => stopB;
    const stop = createCompositeTvSetup({ brands: [a, b], transport: fakeProbe([]) }).discover(
      () => undefined,
    );
    expect(() => stop()).not.toThrow();
    expect(stopB).toHaveBeenCalledTimes(1);
  });
});

describe('composite probe reporting', () => {
  it('emits a probed host as soon as the transport reports it, before the sweep ends', async () => {
    const a = fakeBrand('webos', [3000]);
    let finish: () => void = () => undefined;
    const transport = {
      probe: jest.fn(
        (_p: number[], _m: number, _o: OnOpen, _c?: () => boolean, onHost?: OnHost) => {
          onHost?.('10.0.0.5', [3000]);
          return new Promise<void>((r) => (finish = r));
        },
      ),
    } as Pick<TvTransport, 'probe'>;
    const found: FoundTv[] = [];
    createCompositeTvSetup({ brands: [a], transport }).discover((t) => found.push(t));
    await new Promise((r) => setTimeout(r, 0));
    expect(found.map((f) => f.host)).toEqual(['10.0.0.5']);
    finish();
  });
});

describe('composite with the real webOS brand', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports an SSDP host again as secure when the probe saw only 3001', async () => {
    const lan = createFakeLan({
      tvs: [
        createFakeTv({
          host: '192.168.1.23',
          mac: 'aa:bb:cc:00:11:22',
          secure: true,
          name: 'Lounge LG',
        }),
      ],
    });
    const secrets = {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    };
    const setup = createCompositeTvSetup({
      brands: [createWebosBrand({ transport: lan, secrets })],
      transport: lan,
    });
    const found: FoundTv[] = [];
    setup.discover((t) => found.push(t));
    await jest.advanceTimersByTimeAsync(3000);
    expect(found.map((f) => f.secure)).toEqual([false, true]);
    expect(found.every((f) => f.host === '192.168.1.23')).toBe(true);
    // The secure upgrade keeps the SSDP friendly name and usn.
    expect(found[0]?.name).toBe('Lounge LG');
    expect(found[0]?.usn).toBeTruthy();
    expect(found[1]?.name).toBe('Lounge LG');
    expect(found[1]?.usn).toBe(found[0]?.usn);
  });
});
