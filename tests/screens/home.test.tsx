import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { defaultAcState, defaultFanState } from '@/core';
import type { Command, Device, LinkDriver, Room } from '@/core';
import { t } from '@/i18n';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { StoreError } from '@/store/types';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { ToastProvider } from '@/ui';
import { DeviceHub } from '@/device/hub';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemorySecretStore } from '@/store/secrets';
import { createMemoryPreferenceStore } from '@/store/preferences';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const rooms: Room[] = [
  { id: 'bed', name: 'Bedroom', order: 1 },
  { id: 'liv', name: 'Living room', order: 0 },
];
const dev = (
  id: string,
  kind: Device['kind'],
  roomId: string,
  order: number,
  links: Device['links'],
): Device => ({
  id,
  kind,
  name: `Name ${id}`,
  roomId,
  order,
  links,
});
const ir = { kind: 'ir', remoteId: 'x/y' } as const;
const matter = { kind: 'matter', nodeId: 'n' } as const;

function setup(
  opts: { irAvailable?: boolean; timeoutMs?: number } = {},
): Services & { matterDriver: ReturnType<typeof createFakeDriver> } {
  const matterDriver = createFakeDriver('matter');
  const irDriver = createFakeDriver('ir', { available: opts.irAvailable ?? true });
  const services = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [matterDriver, irDriver],
    ...(opts.timeoutMs
      ? { hub: new DeviceHub({ drivers: [matterDriver, irDriver], timeoutMs: opts.timeoutMs }) }
      : {}),
  });
  return { ...services, matterDriver };
}

async function renderHome(
  s: Services,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): Promise<void> {
  await render(
    <ThemeProvider scheme={opts.scheme ?? 'light'} reducedMotion={opts.reducedMotion}>
      <ServicesProvider services={s}>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </ServicesProvider>
    </ThemeProvider>,
  );
}

async function seed(s: Services, devices: Device[]): Promise<void> {
  for (const r of rooms) await s.store.upsertRoom(r);
  for (const d of devices) await s.store.upsertDevice(d);
}

beforeEach(() => mockPush.mockClear());

describe('HomeScreen', () => {
  it('shows the welcome state when there are no devices', async () => {
    const s = setup();
    await renderHome(s);
    expect(await screen.findByText(t('home.welcomeTitle'))).toBeTruthy();
    expect(screen.getByText('One Remote')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('home.addFirst')));
    expect(mockPush).toHaveBeenCalledWith('/add');
  });

  it('groups devices by room order, cards in order', async () => {
    const s = setup();
    await seed(s, [
      dev('b', 'ac', 'bed', 0, [matter]),
      dev('l2', 'fan', 'liv', 1, [matter]),
      dev('l1', 'tv', 'liv', 0, [matter]),
    ]);
    await renderHome(s);
    await screen.findByText('Living room');
    const texts = screen.getAllByText(/^(Living room|Bedroom|Name )/).map((n) => n.props.children);
    expect(texts).toEqual(['Living room', 'Name l1', 'Name l2', 'Bedroom', 'Name b']);
  });

  it('disables an IR-only device without an IR blaster and shows the banner once', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('i1', 'tv', 'liv', 0, [ir]), dev('i2', 'fan', 'liv', 1, [ir])]);
    await renderHome(s);
    await screen.findByText('Name i1');
    expect(screen.getAllByText(t('home.needsIr'))).toHaveLength(2);
    expect(screen.getAllByText(t('home.noIrBanner'))).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(`Name i1, ${t('home.needsIr')}`));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the needs-IR toast as an error', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('i1', 'tv', 'liv', 0, [ir])]);
    await renderHome(s);
    await fireEvent.press(await screen.findByLabelText(`Name i1, ${t('home.needsIr')}`));
    expect(screen.getByTestId('toast').props.accessibilityLiveRegion).toBe('assertive');
  });

  it('opens a usable device', async () => {
    const s = setup();
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter])]);
    await renderHome(s);
    await fireEvent.press(await screen.findByLabelText('Name l1'));
    expect(mockPush).toHaveBeenCalledWith('/device/l1');
  });

  it('opens the device sheet on a long press, even for a device that needs IR', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter]), dev('i1', 'ac', 'bed', 0, [ir])]);
    await renderHome(s);
    await fireEvent(await screen.findByLabelText('Name l1'), 'longPress');
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/l1');
    const card = screen.getByLabelText(`Name i1, ${t('home.needsIr')}`);
    // The card dims once (0.6); the touchable inside does not dim a second time.
    expect(StyleSheet.flatten(card.props.style).opacity).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('device-card-i1').props.style).opacity).toBe(0.6);
    expect(card.props.accessibilityHint).toBe(t('home.longPressHint'));
    await fireEvent.press(card);
    expect(mockPush).not.toHaveBeenCalledWith('/device/i1');
    await fireEvent(card, 'longPress');
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/i1');
  });

  it('flips power from the last known state with the AC toggle', async () => {
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    const toggle = await screen.findByLabelText(t('home.power', { name: 'Name a1' }));
    await fireEvent.press(toggle);
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(1));
    expect(s.matterDriver.sent[0]?.cmd).toEqual({
      kind: 'ac.set',
      state: { ...defaultAcState(), power: true },
    });
    await fireEvent.press(toggle);
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(2));
    expect(s.matterDriver.sent[1]?.cmd).toEqual({
      kind: 'ac.set',
      state: { ...defaultAcState(), power: false },
    });
  });

  const powerLabel = (id: string): string => t('home.power', { name: `Name ${id}` });
  const checked = (id: string): boolean | undefined =>
    screen.getByLabelText(powerLabel(id)).props.accessibilityState.checked;

  it('flips on then off on two quick taps when the driver reports state', async () => {
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    const toggle = await screen.findByLabelText(powerLabel('a1'));
    await act(async () => {
      s.matterDriver.emit('a1', { kind: 'ac', state: { ...defaultAcState(), power: false } });
    });
    await fireEvent.press(toggle);
    await fireEvent.press(toggle);
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(2));
    expect(s.matterDriver.sent.map((x) => x.cmd)).toEqual([
      { kind: 'ac.set', state: { ...defaultAcState(), power: true } },
      { kind: 'ac.set', state: { ...defaultAcState(), power: false } },
    ]);
  });

  it('shows the switch at once and drops it back when the send fails', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    await screen.findByLabelText(powerLabel('a1'));
    expect(checked('a1')).toBe(false);
    s.matterDriver.failNext('notSent');
    await fireEvent.press(screen.getByLabelText(powerLabel('a1')));
    await waitFor(() => expect(checked('a1')).toBe(false));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('shows the switch on at once while the send is pending', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup({ timeoutMs: 20 });
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    await screen.findByLabelText(powerLabel('a1'));
    s.matterDriver.hangNext();
    await fireEvent.press(screen.getByLabelText(powerLabel('a1')));
    expect(checked('a1')).toBe(true);
    await waitFor(() => expect(err).toHaveBeenCalled()); // let the hung send time out
    err.mockRestore();
  });

  it('has a power toggle on a fan card that flips fan.set', async () => {
    const s = setup();
    await seed(s, [dev('f1', 'fan', 'liv', 0, [matter])]);
    await renderHome(s);
    await fireEvent.press(await screen.findByLabelText(powerLabel('f1')));
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(1));
    expect(s.matterDriver.sent[0]?.cmd).toEqual({
      kind: 'fan.set',
      state: { ...defaultFanState(), power: true },
    });
  });

  it('renders a device added right after its room, and keeps it live', async () => {
    const s = setup();
    await renderHome(s);
    await screen.findByText(t('home.welcomeTitle'));
    await act(async () => {
      const room = rooms[1];
      if (room) await s.store.upsertRoom(room);
      await s.store.upsertDevice(dev('a1', 'ac', 'liv', 0, [matter]));
    });
    await screen.findByText('Name a1');
    await act(async () => {
      s.matterDriver.emit('a1', {
        kind: 'ac',
        state: { ...defaultAcState(), power: true, setpoint: 24 },
      });
    });
    expect(await screen.findByText('Cool · 24°')).toBeTruthy();
    expect(screen.getByText('1 device')).toBeTruthy();
  });

  it('labels a card with its name and summary', async () => {
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    await screen.findByLabelText('Name a1');
    await act(async () => {
      s.matterDriver.emit('a1', { kind: 'ac', state: { ...defaultAcState(), power: false } });
    });
    expect(await screen.findByLabelText('Name a1, Off')).toBeTruthy();
  });

  describe('with sends that stay in flight', () => {
    /** A driver whose sends settle only when the test says so; `observing` keeps the fake's observe. */
    function deferred(kind: 'ir' | 'matter', observing: boolean) {
      const fake = createFakeDriver(kind);
      const pending: (() => void)[] = [];
      const sent: Command[] = [];
      const base: LinkDriver = {
        kind,
        available: fake.available,
        supports: fake.supports,
        capabilities: fake.capabilities,
        send: (_d, _l, cmd) => {
          sent.push(cmd);
          return new Promise<void>((resolve) => pending.push(resolve));
        },
      };
      const driver: LinkDriver = observing ? { ...base, observe: fake.observe } : base;
      return {
        driver,
        fake,
        sent,
        settle: async (): Promise<void> => {
          await act(async () => {
            pending.shift()?.();
          });
        },
      };
    }
    const flush = (): Promise<void> => act(async () => undefined);

    async function boot(d: ReturnType<typeof deferred>, device: Device): Promise<Services> {
      const s = createServices({
        store: createMemoryStore(),
        secrets: createMemorySecretStore(),
        prefs: createMemoryPreferenceStore(),
        drivers: [d.driver],
      });
      await seed(s, [device]);
      await renderHome(s);
      await screen.findByLabelText(powerLabel(device.id));
      return s;
    }
    const link = (kind: 'ir' | 'matter') =>
      kind === 'ir' ? ([ir] as Device['links']) : ([matter] as Device['links']);
    const power = (cmd: Command | undefined): boolean | undefined =>
      cmd && (cmd.kind === 'ac.set' || cmd.kind === 'fan.set') ? cmd.state.power : undefined;

    it('keeps a double and a triple tap consistent on a non-observing driver, with no flicker', async () => {
      const d = deferred('ir', false);
      await boot(d, dev('a1', 'ac', 'liv', 0, link('ir')));
      const toggle = (): Promise<unknown> =>
        fireEvent.press(screen.getByLabelText(powerLabel('a1')));
      await toggle(); // on
      await toggle(); // off, queued behind the first
      expect(checked('a1')).toBe(false);
      await d.settle(); // send 1 done: the hub replaces its remembered state
      await flush();
      expect(checked('a1')).toBe(false); // no flicker back to "on"
      await toggle(); // third tap while send 2 is still queued: on again
      expect(checked('a1')).toBe(true);
      await d.settle();
      await d.settle();
      await waitFor(() => expect(d.sent).toHaveLength(3));
      expect(d.sent.map(power)).toEqual([true, false, true]);
      await d.settle();
    });

    it('keeps a quick double tap consistent on a fan', async () => {
      const d = deferred('ir', false);
      await boot(d, dev('f1', 'fan', 'liv', 0, link('ir')));
      const toggle = (): Promise<unknown> =>
        fireEvent.press(screen.getByLabelText(powerLabel('f1')));
      await toggle();
      await toggle();
      await d.settle();
      await flush();
      expect(checked('f1')).toBe(false);
      await d.settle();
      await waitFor(() => expect(d.sent).toHaveLength(2));
      expect(d.sent.map(power)).toEqual([true, false]);
      expect(d.sent.every((c) => c.kind === 'fan.set')).toBe(true);
    });

    it('ignores an observed update that arrives during an in-flight send', async () => {
      const d = deferred('matter', true);
      await boot(d, dev('a1', 'ac', 'liv', 0, link('matter')));
      await act(async () => {
        d.fake.emit('a1', { kind: 'ac', state: { ...defaultAcState(), power: false } });
      });
      await fireEvent.press(screen.getByLabelText(powerLabel('a1')));
      await act(async () => {
        d.fake.emit('a1', { kind: 'ac', state: { ...defaultAcState(), power: false } }); // a poll
      });
      expect(checked('a1')).toBe(true);
      await d.settle();
      await flush();
    });
  });

  it('does not stay unloaded when a store read fails', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup();
    const broken = { ...s.store, rooms: () => Promise.reject(new Error('disk')) };
    await renderHome({ ...s, store: broken });
    expect(await screen.findByText(t('home.welcomeTitle'))).toBeTruthy();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('HomeScreen to the mock', () => {
  it('shows 5 skeleton cards and a disabled gear before the store resolves', async () => {
    const s = setup();
    const never = (): Promise<never> => new Promise(() => undefined);
    await renderHome({ ...s, store: { ...s.store, rooms: never, devices: never } });
    expect(screen.getAllByTestId('skel-card')).toHaveLength(5);
    expect(screen.getByLabelText(t('home.settings')).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(t('home.add')).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText(t('common.loading'))).toBeTruthy();
  });

  it('puts the gear before the plus', async () => {
    const s = setup();
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter])]);
    await renderHome(s);
    await screen.findByText('Name l1');
    const labels = screen
      .getAllByLabelText(new RegExp(`^(${t('home.settings')}|${t('home.add')})$`))
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual([t('home.settings'), t('home.add')]);
    expect(screen.queryAllByTestId('skel-card')).toHaveLength(0);
  });

  it('shows a toast, not a screen, when a needs-IR card is pressed', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('i1', 'tv', 'liv', 0, [ir])]);
    await renderHome(s);
    await fireEvent.press(await screen.findByLabelText(`Name i1, ${t('home.needsIr')}`));
    const toast = await screen.findByTestId('toast');
    expect(within(toast).getByText(t('home.needsIr'))).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps a 40-character name to two lines with the switch still shown', async () => {
    const s = setup();
    const long = 'N'.repeat(40);
    await seed(s, [{ ...dev('a1', 'ac', 'liv', 0, [matter]), name: long }]);
    await renderHome(s);
    expect((await screen.findByText(long)).props.numberOfLines).toBe(2);
    expect(screen.getByLabelText(t('home.power', { name: long }))).toBeTruthy();
  });

  it('offers only the gear and the pinned add button on an empty Home', async () => {
    const s = setup();
    await renderHome(s);
    expect(await screen.findByText(t('home.addFirst'))).toBeTruthy();
    expect(screen.getByLabelText(t('home.settings'))).toBeTruthy();
    expect(screen.queryByLabelText(t('home.add'))).toBeNull();
  });

  it('paints cards with the dark surface in the dark theme', async () => {
    const s = setup();
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter])]);
    await renderHome(s, { scheme: 'dark' });
    const card = await screen.findByTestId('device-card-l1');
    expect(StyleSheet.flatten(card.props.style).backgroundColor).toBe(darkTokens.color.surface);
  });

  it('renders cards under reduced motion with no translate, unlike a motion render', async () => {
    const s = setup();
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter])]);
    await renderHome(s, { reducedMotion: true });
    const card = await screen.findByTestId('device-card-l1');
    const translates = (n: typeof card): unknown[] =>
      [StyleSheet.flatten(n.props.style).transform ?? []]
        .flat()
        .filter((x) => x !== null && typeof x === 'object' && 'translateY' in (x as object));
    expect(translates(card)).toEqual([]);
  });

  it('disables the switch of a needs-IR card', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('i1', 'ac', 'liv', 0, [ir])]);
    await renderHome(s);
    const toggle = await screen.findByLabelText(t('home.power', { name: 'Name i1' }));
    expect(toggle.props.accessibilityState.disabled).toBe(true);
  });

  it('colours the tile accent when the device is on, ink when off', async () => {
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter]), dev('a2', 'ac', 'liv', 1, [matter])]);
    await renderHome(s);
    await screen.findByText('Name a1');
    await act(async () => {
      s.matterDriver.emit('a1', { kind: 'ac', state: { ...defaultAcState(), power: true } });
      s.matterDriver.emit('a2', { kind: 'ac', state: { ...defaultAcState(), power: false } });
    });
    const stroke = (id: string): string => {
      const found: string[] = [];
      const walk = (n: unknown, inside: boolean): void => {
        if (n === null || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach((c) => walk(c, inside));
        const node = n as { props?: Record<string, unknown>; children?: unknown };
        const here = inside || node.props?.testID === `device-card-${id}`;
        if (here && typeof node.props?.stroke === 'string') found.push(node.props.stroke);
        walk(node.children, here);
      };
      walk(screen.toJSON(), false);
      return found.join(' ');
    };
    await waitFor(() => expect(stroke('a1')).toContain(lightTokens.color.accent));
    expect(stroke('a2')).not.toContain(lightTokens.color.accent);
  });
});

describe('HomeScreen with corrupt home data', () => {
  it('shows an error, not the welcome, and offers no add button', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup();
    const corrupt = (): Promise<never> => Promise.reject(new StoreError('corrupt'));
    await renderHome({ ...s, store: { ...s.store, rooms: corrupt, devices: corrupt } });
    expect(await screen.findByText(t('home.corruptTitle'))).toBeTruthy();
    expect(screen.getByText(t('home.corruptBody'))).toBeTruthy();
    expect(screen.queryByText(t('home.welcomeTitle'))).toBeNull();
    expect(screen.queryByLabelText(t('home.addFirst'))).toBeNull();
    expect(screen.queryByLabelText(t('home.add'))).toBeNull();
    err.mockRestore();
  });

  it('recovers once the data reads again', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup();
    let broken = true;
    const rooms = s.store.rooms.bind(s.store);
    const store = {
      ...s.store,
      rooms: () => (broken ? Promise.reject(new StoreError('corrupt')) : rooms()),
    };
    await renderHome({ ...s, store });
    expect(await screen.findByText(t('home.corruptTitle'))).toBeTruthy();
    broken = false;
    await act(async () => {
      await s.store.upsertRoom({ id: 'x', name: 'X', order: 0 });
    });
    expect(await screen.findByText(t('home.welcomeTitle'))).toBeTruthy();
    expect(screen.queryByText(t('home.corruptTitle'))).toBeNull();
    err.mockRestore();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
