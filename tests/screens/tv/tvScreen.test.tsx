import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, Linking, Platform } from 'react-native';
import type { Device, TvSetup } from '@/core';
import type { FakeDriver } from '@/device/testing/fakeDriver';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { TvScreen } from '@/screens/tv/TvScreen';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { renderWith, room } from '../helpers';

jest.mock('react-native-udp');
const mockUseVolumeKeys = jest.fn();
jest.mock('@/screens/tv/useVolumeKeys', () => ({
  useVolumeKeys: (...a: unknown[]) => mockUseVolumeKeys(...a),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
let mockNetType: string | undefined = 'WIFI';
jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI' },
  useNetworkState: () => ({ type: mockNetType }),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

const tvDevice = (id: string): Device => ({
  id,
  kind: 'tv',
  name: `TV ${id}`,
  roomId: 'r1',
  order: id === 'tv1' ? 0 : 1,
  links: [{ kind: 'webos', host: '192.168.1.23', secure: true, clientKeyRef: `k-${id}` }],
});

interface Rig {
  s: Services;
  webos: FakeDriver;
  findAgain: jest.Mock;
  sent: () => unknown[];
}

async function rig(): Promise<Rig> {
  const webos = createFakeDriver('webos');
  const findAgain = jest.fn(() => Promise.resolve<string | null>(null));
  const tv: TvSetup = {
    discover: () => () => undefined,
    probeHost: () => Promise.resolve(null),
    pair: () => Promise.reject(new Error('unused')),
    findAgain,
  };
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [webos],
    tv,
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  await s.store.upsertDevice(tvDevice('tv1'));
  await s.store.upsertDevice(tvDevice('tv2'));
  await act(async () => {
    await Promise.resolve();
  });
  return { s, webos, findAgain, sent: () => webos.sent.map((x) => x.cmd) };
}

const advance = (ms: number): Promise<void> =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  mockNetType = 'WIFI';
  // Jest's React Native setup mocks currentState with a function; a device gives a string.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const on = (r: Rig, id = 'tv1'): Promise<void> =>
  act(async () => {
    r.webos.emit(id, { kind: 'tv', state: { power: true } });
  });

describe('TvScreen', () => {
  it('opens on the touchpad', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    expect(screen.getByText(t('tv.statusConnecting'))).toBeTruthy();
  });

  it('remembers the D-pad per TV', async () => {
    const r = await rig();
    const set = jest.spyOn(r.s.prefs, 'set');
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.dpad')));
    await advance(0);
    expect(set).toHaveBeenCalledWith({ tvPad: { tv1: 'dpad' } });
    expect(screen.getByLabelText(t('tv.up'))).toBeTruthy();

    // A fresh screen for tv1 opens on the D-pad; tv2 on the touchpad.
    await screen.unmount();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await advance(0);
    expect(screen.getByLabelText(t('tv.up'))).toBeTruthy();
    await screen.unmount();
    await renderWith(r.s, <TvScreen deviceId="tv2" />);
    await advance(0);
    expect(screen.queryByLabelText(t('tv.up'))).toBeNull();
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('opens a TV with no saved choice on the touchpad', async () => {
    const r = await rig();
    await r.s.prefs.set({ tvPad: { tv1: 'dpad' } });
    await renderWith(r.s, <TvScreen deviceId="tv2" />);
    await advance(0);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.up'))).toBeNull();
  });

  it('sends keys from the D-pad and the volume rocker', async () => {
    const r = await rig();
    await r.s.prefs.set({ tvPad: { tv1: 'dpad' } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await advance(0);
    for (const label of ['tv.up', 'tv.ok', 'tv.volumeUp', 'tv.volumeDown']) {
      await fireEvent.press(screen.getByLabelText(t(label)));
      await advance(0);
    }
    expect(r.sent()).toEqual([
      { kind: 'tv.key', key: 'up' },
      { kind: 'tv.key', key: 'ok' },
      { kind: 'tv.key', key: 'volumeUp' },
      { kind: 'tv.key', key: 'volumeDown' },
    ]);
  });

  it('sends the whole keyboard text once, 300 ms after typing stops', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.keyboard')));
    await fireEvent.changeText(screen.getByLabelText(t('tv.keyboardField')), 'tom');
    await advance(299);
    expect(r.sent()).toEqual([]);
    await advance(1);
    expect(r.sent()).toEqual([{ kind: 'tv.text', text: 'tom' }]);
    await fireEvent.press(screen.getByLabelText(t('tv.keyboardDone')));
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('shows the off panel, wakes the TV, and explains a failed wake after 20 s', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(screen.getByText(t('tv.offTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('tv.turnOn')));
    await advance(0);
    expect(r.sent()).toEqual([{ kind: 'tv.powerOn' }]);
    expect(screen.getByText(t('tv.waking'))).toBeTruthy();
    await advance(20000);
    expect(screen.getByText(/Turn on via Wi-Fi/)).toBeTruthy();
  });

  it('shows the pad again once the TV reports on', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.turnOn')));
    await on(r);
    expect(screen.getByText(t('tv.statusConnected'))).toBeTruthy();
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('is unreachable off Wi-Fi, and Find TV again looks for the TV', async () => {
    mockNetType = 'CELLULAR';
    const r = await rig();
    const open = jest.spyOn(Linking, 'sendIntent').mockResolvedValue(undefined);
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.getByText(t('tv.unreachableTitle'))).toBeTruthy();
    r.findAgain.mockResolvedValueOnce('192.168.1.40');
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    expect(r.findAgain).toHaveBeenCalledWith(expect.objectContaining({ id: 'tv1' }));
    expect(await screen.findByText(t('tv.foundAt', { host: '192.168.1.40' }))).toBeTruthy();
    const stored = (await r.s.store.devices()).find((d) => d.id === 'tv1');
    expect(stored?.links[0]).toMatchObject({ host: '192.168.1.40' });
    await fireEvent.press(screen.getByLabelText(t('tv.wifiSettings')));
    expect(open).toHaveBeenCalledWith('android.settings.WIFI_SETTINGS');
  });

  it('says so when Find TV again finds nothing', async () => {
    mockNetType = 'CELLULAR';
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    expect(await screen.findByText(t('tv.notFound'))).toBeTruthy();
  });

  it('keeps the phone volume keys only while the rocker is on screen', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(mockUseVolumeKeys).toHaveBeenLastCalledWith('tv1', true);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(mockUseVolumeKeys).toHaveBeenLastCalledWith('tv1', false);
  });

  it('the power button sends the power key while still connecting', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.power')));
    await advance(0);
    expect(r.sent()).toEqual([{ kind: 'tv.key', key: 'power' }]);
  });

  it('does not crash when saving the pad style fails', async () => {
    const r = await rig();
    jest.spyOn(r.s.prefs, 'set').mockRejectedValue(new Error('disk'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.dpad')));
    await advance(0);
    expect(err).toHaveBeenCalledWith('Could not save the pad style', expect.any(Error));
  });

  it('still sends typed text when the keyboard goes away before the debounce ends', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.keyboard')));
    await fireEvent.changeText(screen.getByLabelText(t('tv.keyboardField')), 'ab');
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await advance(0);
    expect(r.sent()).toEqual([{ kind: 'tv.text', text: 'ab' }]);
  });

  it('opens the iOS settings app on iPhone', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockNetType = 'CELLULAR';
    const r = await rig();
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.wifiSettings')));
    expect(open).toHaveBeenCalled();
  });

  it('is unreachable when the TV never reports within 5 s', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await advance(5000);
    expect(screen.getByText(t('tv.unreachableTitle'))).toBeTruthy();
  });

  it('says "Sent over IR" after an IR fallback', async () => {
    const r = await rig();
    jest.spyOn(r.s.hub, 'view').mockImplementation((id) => ({
      device: tvDevice(id),
      usable: true,
      status: { via: 'ir', fellBack: true },
      state: { kind: 'tv', state: { power: true } },
      capabilities: {},
    }));
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.getByText(t('tv.statusIr'))).toBeTruthy();
  });

  it('maps a send failure to one line', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    r.webos.failNext('timeout');
    await fireEvent.press(screen.getByLabelText(t('tv.home')));
    await advance(0);
    expect(screen.getByText(t('tv.errTimeout'))).toBeTruthy();
  });

  it('stops watching in the background and watches again on return', async () => {
    const r = await rig();
    let onChange: ((s: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      onChange = cb as (s: string) => void;
      return { remove };
    });
    const unsub = jest.fn();
    const real = r.s.hub.subscribe.bind(r.s.hub);
    const subscribe = jest.spyOn(r.s.hub, 'subscribe').mockImplementation((id, cb) => {
      const stop = real(id, cb);
      return () => {
        unsub();
        stop();
      };
    });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(subscribe).toHaveBeenCalledTimes(1);
    await act(async () => onChange?.('background'));
    expect(unsub).toHaveBeenCalledTimes(1);
    await act(async () => onChange?.('active'));
    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});
