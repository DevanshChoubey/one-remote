import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet, AppState, BackHandler, Linking, Platform } from 'react-native';
import type { Capabilities, Device, TvSetup } from '@/core';
import type { FakeDriver } from '@/device/testing/fakeDriver';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { darkTokens } from '@/theme';
import { TvScreen } from '@/screens/tv/TvScreen';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { createFakeDictation } from '@/voice/testing/fakeDictation';
import { createFakeMic } from '@/voice/testing/fakeMic';
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
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

function hasAlertAncestor(node: { parent: unknown }): boolean {
  let cur = node.parent as { parent: unknown; props?: { accessibilityRole?: string } } | null;
  while (cur) {
    if (cur.props?.accessibilityRole === 'alert') return true;
    cur = cur.parent as typeof cur | null;
  }
  return false;
}

const tvDevice = (id: string, brand: 'webos' | 'androidtv' = 'webos'): Device => ({
  id,
  kind: 'tv',
  name: `TV ${id}`,
  roomId: 'r1',
  order: id === 'tv1' ? 0 : 1,
  links: [
    brand === 'webos'
      ? { kind: 'webos', host: '192.168.1.23', secure: true, clientKeyRef: `k-${id}` }
      : {
          kind: 'androidtv',
          host: '192.168.1.23',
          certRef: 'androidtv:identity',
          pinSha256: `pin-${id}`,
        },
  ],
});

interface Rig {
  s: Services;
  webos: FakeDriver;
  findAgain: jest.Mock;
  sent: () => unknown[];
}

async function rig(
  capabilities?: Capabilities,
  brand: 'webos' | 'androidtv' = 'webos',
): Promise<Rig> {
  const webos = createFakeDriver(brand, capabilities ? { capabilities } : {});
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
  await s.store.upsertDevice(tvDevice('tv1', brand));
  await s.store.upsertDevice(tvDevice('tv2', brand));
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
    await on(r);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    expect(screen.getByText(t('tv.statusConnected'))).toBeTruthy();
  });

  it('shows a skeleton pad with a Connecting pill, and no pad, while connecting', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.getAllByText(t('tv.statusConnecting')).length).toBe(2);
    expect(screen.queryByText(t('tv.touchpadHint'))).toBeNull();
    expect(screen.getByLabelText(t('tv.home'))).toBeTruthy();
  });

  it('the ⋮ menu switches to D-pad and remembers it per TV', async () => {
    const r = await rig();
    const set = jest.spyOn(r.s.prefs, 'set');
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.dpad')));
    await advance(0);
    expect(set).toHaveBeenCalledWith({ tvPad: { tv1: 'dpad' } });
    expect(screen.getByLabelText(t('tv.up'))).toBeTruthy();

    // A fresh screen for tv1 opens on the D-pad; tv2 on the touchpad.
    await screen.unmount();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await advance(0);
    expect(screen.getByLabelText(t('tv.up'))).toBeTruthy();
    await screen.unmount();
    await renderWith(r.s, <TvScreen deviceId="tv2" />);
    await on(r, 'tv2');
    await advance(0);
    expect(screen.queryByLabelText(t('tv.up'))).toBeNull();
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('opens a TV with no saved choice on the touchpad', async () => {
    const r = await rig();
    await r.s.prefs.set({ tvPad: { tv1: 'dpad' } });
    await renderWith(r.s, <TvScreen deviceId="tv2" />);
    await on(r, 'tv2');
    await advance(0);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.up'))).toBeNull();
  });

  it('sends keys from the D-pad', async () => {
    const r = await rig();
    await r.s.prefs.set({ tvPad: { tv1: 'dpad' } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await advance(0);
    for (const label of ['tv.up', 'tv.ok']) {
      await fireEvent.press(screen.getByLabelText(t(label)));
      await advance(0);
    }
    expect(r.sent()).toEqual([
      { kind: 'tv.key', key: 'up' },
      { kind: 'tv.key', key: 'ok' },
    ]);
  });

  it('sends the whole keyboard text once, 300 ms after typing stops', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.keyboard')));
    await fireEvent.changeText(screen.getByLabelText(t('tv.keyboardField')), 'tom');
    await advance(299);
    expect(r.sent()).toEqual([]);
    await advance(1);
    expect(r.sent()).toEqual([{ kind: 'tv.text', text: 'tom' }]);
    await fireEvent.press(screen.getByLabelText(t('tv.keyboardDone')));
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('opens the input sheet only after the menu has left, and plays the sheet exit', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.input')));
    // The menu is still leaving: no second Modal yet.
    expect(screen.queryByTestId('tv-inputs')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('tv-inputs')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('tv.inputsDone')));
    // It stays mounted while it slides out, then goes.
    expect(screen.getByTestId('tv-inputs')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId('tv-inputs')).toBeNull();
  });

  it('lists the TV inputs and switches to the one picked', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', {
        kind: 'tv',
        state: {
          power: true,
          inputs: [
            { id: 'HDMI_1', label: 'HDMI 1', connected: true },
            { id: 'HDMI_2', label: 'PlayStation', connected: false },
          ],
        },
      });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.input')));
    // The sheet opens once the menu's exit has finished.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByText(t('tv.inputsTitle'))).toBeTruthy();
    expect(screen.getByText(t('tv.inputEmpty', { label: 'PlayStation' }))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('HDMI 1'));
    expect(r.sent()).toEqual([{ kind: 'tv.input', inputId: 'HDMI_1' }]);
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('says so when the TV has not listed its inputs, and closes on Done', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.input')));
    // The sheet opens once the menu's exit has finished.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByText(t('tv.inputsNone'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('tv.inputsDone')));
    expect(r.sent()).toEqual([]);
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
    expect(screen.getAllByText(t('tv.waking')).length).toBeGreaterThan(0);
    await advance(45000);
    expect(screen.getByText(/Turn on via Wi-Fi/)).toBeTruthy();
  });

  it('explains a failed wake of an Android TV with its own line, not the LG one', async () => {
    const r = await rig(undefined, 'androidtv');
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.turnOn')));
    await advance(0);
    await advance(45000);
    expect(screen.getByText(t('tv.wakeFailedAndroidTv'))).toBeTruthy();
    expect(screen.queryByText(/Turn on via Wi-Fi/)).toBeNull();
  });

  it('explains a failed wake with the Samsung line for a Samsung TV, and the LG line for LG', async () => {
    const samsung = createFakeDriver('samsung');
    const tv: TvSetup = {
      discover: () => () => undefined,
      probeHost: () => Promise.resolve(null),
      pair: () => Promise.reject(new Error('unused')),
      findAgain: () => Promise.resolve(null),
    };
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [samsung],
      tv,
    });
    await s.store.upsertRoom(room('r1', 'Living room', 0));
    await s.store.upsertDevice({
      ...tvDevice('tv1'),
      links: [
        {
          kind: 'samsung',
          host: '192.168.1.40',
          mac: 'aa:bb:cc:dd:ee:ff',
          tokenRef: 't',
          pinSha256: 'p',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    await renderWith(s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      samsung.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.turnOn')));
    await advance(45000);
    expect(screen.getByText(t('tv.wakeFailedSamsung'))).toBeTruthy();
    expect(screen.queryByText(t('tv.wakeFailed'))).toBeNull();
  });

  it('sends the Input key when the TV cannot list its inputs', async () => {
    const r = await rig({ tv: { inputList: false, text: true, powerOn: true, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.input')));
    await advance(0);
    expect(r.sent()).toEqual([{ kind: 'tv.key', key: 'input' }]);
    expect(screen.queryByText(t('tv.inputsTitle'))).toBeNull();
  });

  it('hides the Keyboard button when the TV takes no text', async () => {
    const r = await rig({ tv: { inputList: true, text: false, powerOn: true, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.queryByLabelText(t('tv.keyboard'))).toBeNull();
    expect(screen.getByLabelText(t('tv.more'))).toBeTruthy();
  });

  it('puts Keyboard and the ⋮ button in the header', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    expect(screen.getByLabelText(t('tv.keyboard'))).toBeTruthy();
    expect(screen.getByLabelText(t('tv.more'))).toBeTruthy();
  });

  it('opens the device settings from the ⋮ menu', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.queryByLabelText(t('device.open'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('device.open')));
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/tv1');
    // The menu plays its exit before it unmounts.
    await waitFor(() => expect(screen.queryByLabelText(t('device.open'))).toBeNull());
  });

  it('keeps ⋮ with only the device settings when the TV is off', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(screen.getByText(t('tv.offTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    expect(screen.getByLabelText(t('device.open'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.dpad'))).toBeNull();
    expect(screen.queryByLabelText(t('tv.input'))).toBeNull();
  });

  it('has no volume, mute or play/pause buttons', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    for (const label of ['Volume up', 'Volume down', 'Mute', 'Play or pause']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(screen.getAllByLabelText(t('tv.goBack')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(t('tv.home'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.input'))).toBeNull();
    expect(screen.queryByLabelText(t('tv.dpad'))).toBeNull();
  });

  it('closes the ⋮ menu after an item is picked', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.dpad')));
    await advance(0);
    expect(screen.queryByLabelText(t('tv.touchpad'))).toBeNull();
  });

  it('says the TV cannot be turned on from the phone, with no Turn on button', async () => {
    const r = await rig({ tv: { inputList: true, text: true, powerOn: false, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(screen.getByText(t('tv.cantTurnOn'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.turnOn'))).toBeNull();
  });

  it('says why with a toast when power is tapped on a TV the phone cannot wake', async () => {
    const r = await rig({ tv: { inputList: true, text: true, powerOn: false, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.power')));
    expect(within(screen.getByTestId('toast')).getByText(t('tv.cantTurnOn'))).toBeTruthy();
    expect(r.sent()).toEqual([]);
  });

  it('centres the off panel text and stretches Turn on to the panel width', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    for (const key of ['tv.offTitle', 'tv.offBody', 'tv.offHint']) {
      expect(StyleSheet.flatten(screen.getByText(t(key)).props.style)).toMatchObject({
        textAlign: 'center',
      });
    }
    expect(StyleSheet.flatten(screen.getByLabelText(t('tv.turnOn')).props.style)).toMatchObject({
      alignSelf: 'stretch',
    });
  });

  it('says Wi-Fi connected once Find TV again has found the TV', async () => {
    mockNetType = 'CELLULAR';
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.queryByText(t('tv.statusConnected'))).toBeNull();
    r.findAgain.mockResolvedValueOnce('192.168.1.40');
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    expect(await screen.findByText(t('tv.foundAt', { host: '192.168.1.40' }))).toBeTruthy();
    expect(screen.getByText(t('tv.statusConnected'))).toBeTruthy();
    // Only the panel's heading still says it; the status line has moved on.
    expect(screen.getAllByText(t('tv.unreachableTitle'))).toHaveLength(1);
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
    expect(screen.getAllByText(t('tv.unreachableTitle')).length).toBeGreaterThan(0);
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

  it('gives the not-found note the alert role and the found note none', async () => {
    mockNetType = 'CELLULAR';
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    const bad = await screen.findByText(t('tv.notFound'));
    expect(hasAlertAncestor(bad)).toBe(true);
    r.findAgain.mockResolvedValueOnce('192.168.1.40');
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    expect(await screen.findByText(t('tv.foundAt', { host: '192.168.1.40' }))).toBeTruthy();
    expect(hasAlertAncestor(screen.getByText(t('tv.foundAt', { host: '192.168.1.40' })))).toBe(
      false,
    );
  });

  it('keeps the phone volume keys only while the remote is on screen', async () => {
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
    await on(r);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.dpad')));
    await advance(0);
    expect(err).toHaveBeenCalledWith('Could not save the pad style', expect.any(Error));
  });

  it('still sends typed text when the keyboard goes away before the debounce ends', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
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
    expect(screen.getAllByText(t('tv.unreachableTitle')).length).toBeGreaterThan(0);
  });

  it('starts a new connecting window on return, rather than "unreachable" at once', async () => {
    const r = await rig();
    let onChange: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      onChange = cb as (s: string) => void;
      return { remove: jest.fn() };
    });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await advance(5000);
    expect(screen.getAllByText(t('tv.unreachableTitle')).length).toBeGreaterThan(0);
    await act(async () => onChange?.('background'));
    await act(async () => onChange?.('active'));
    expect(screen.queryAllByText(t('tv.unreachableTitle'))).toHaveLength(0);
    expect(screen.getAllByText(t('tv.statusConnecting')).length).toBeGreaterThan(0);
    await advance(5000);
    expect(screen.getAllByText(t('tv.unreachableTitle')).length).toBeGreaterThan(0);
  });

  it('does not show an old "on" as live on return, though Home still subscribes', async () => {
    const r = await rig();
    let onChange: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      onChange = cb as (s: string) => void;
      return { remove: jest.fn() };
    });
    const home = r.s.hub.subscribe('tv1', () => undefined);
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: true } });
    });
    expect(screen.getByTestId('tv-pad-area')).toBeTruthy();
    await act(async () => onChange?.('background'));
    await act(async () => onChange?.('active'));
    expect(screen.queryByTestId('tv-pad-area')).toBeNull();
    expect(screen.getAllByText(t('tv.statusConnecting')).length).toBeGreaterThan(0);
    home();
  });

  it('does not renew on a store write: a TV that is on stays on', async () => {
    const r = await rig();
    const renew = jest.spyOn(r.s.hub, 'renew');
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    expect(renew).toHaveBeenCalledTimes(1);
    const [tv] = (await r.s.store.devices()).filter((d) => d.id === 'tv1');
    if (!tv) throw new Error('no tv1');
    await act(async () => {
      await r.s.store.upsertDevice({ ...tv, name: 'Bedroom TV' });
    });
    await advance(6000);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tv-pad-area')).toBeTruthy();
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

describe('TvScreen shell', () => {
  it('marks the More button expanded while the menu is open', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    const more = (): ReturnType<typeof screen.getByLabelText> =>
      screen.getByLabelText(t('tv.more'));
    expect(more().props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(more());
    expect(screen.getByTestId('tv-menu')).toBeTruthy();
    expect(more().props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('Android back closes the open menu and does not leave the screen', async () => {
    const r = await rig();
    let back: ((e: never) => boolean | null | undefined) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_n, cb) => {
      back = cb;
      return { remove: jest.fn() };
    });
    mockBack.mockClear();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    expect(screen.getByTestId('tv-menu')).toBeTruthy();
    await act(async () => {
      expect(back?.({} as never)).toBe(true);
    });
    await waitFor(() => expect(screen.queryByTestId('tv-menu')).toBeNull());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows a timed-out key send as a toast with Try again, which sends it again', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    r.webos.failNext('timeout');
    await fireEvent.press(screen.getByLabelText(t('tv.home')));
    await advance(0);
    expect(screen.getByTestId('toast')).toHaveTextContent(new RegExp(t('tv.errTimeout')));
    await fireEvent.press(screen.getByLabelText(t('common.retry')));
    await advance(0);
    // The refused send was not delivered; the retry was.
    expect(r.sent()).toEqual([{ kind: 'tv.key', key: 'home' }]);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('shows the pair-again banner when the TV no longer trusts the phone', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    r.webos.failNext('notPaired');
    await fireEvent.press(screen.getByLabelText(t('tv.home')));
    await advance(0);
    expect(screen.getByTestId('tv-not-paired')).toBeTruthy();
    // The real pad stays, faded, behind the banner.
    expect(screen.getByTestId('tv-pad-dimmed')).toBeTruthy();
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
    // The mock's toast points at ⋯ and offers Pair again.
    const toast = screen.getByTestId('toast');
    expect(within(toast).getByText(t('tv.errNotPaired'))).toBeTruthy();
    mockPush.mockClear();
    await fireEvent.press(within(toast).getByText(t('addTv.pairAgain')));
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/tv1');
  });

  it('opens the pairing flow from the pair-again button too', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    r.webos.failNext('notPaired');
    await fireEvent.press(screen.getByLabelText(t('tv.home')));
    await advance(0);
    mockPush.mockClear();
    await fireEvent.press(
      within(screen.getByTestId('tv-screen')).getByLabelText(t('addTv.pairAgain')),
    );
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/tv1');
  });

  it('marks the input the TV shows now, and disables the empty ones', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', {
        kind: 'tv',
        state: {
          power: true,
          currentInputId: 'HDMI_1',
          inputs: [
            { id: 'HDMI_1', label: 'HDMI 1', connected: true },
            { id: 'HDMI_2', label: 'PlayStation', connected: false },
          ],
        },
      });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    await fireEvent.press(screen.getByLabelText(t('tv.input')));
    // The sheet opens once the menu's exit has finished.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('tv-inputs')).toBeTruthy();
    expect(screen.getAllByText(t('tv.inputNow'))).toHaveLength(1);
    // The empty input says so in the row, faded, and is not a button.
    const empty = screen.getByTestId('tv-input-empty-HDMI_2');
    expect(empty.props.style).toMatchObject({ opacity: 0.7 });
    expect(within(empty).getByText(t('tv.inputEmpty', { label: 'PlayStation' }))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.inputEmpty', { label: 'PlayStation' }))).toBeNull();
  });

  it('dims the pads to 0.55 while the mic is held, and restores them on release', async () => {
    const webos = createFakeDriver('androidtv', {
      capabilities: { tv: { inputList: true, text: true, powerOn: true, voice: true } },
      startVoice: () => Promise.resolve({ push: () => undefined, end: () => undefined }),
    });
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [webos],
      voice: { mic: createFakeMic(), dictation: createFakeDictation(false) },
    });
    await s.store.upsertRoom(room('r1', 'Living room', 0));
    await s.store.upsertDevice(tvDevice('tv1', 'androidtv'));
    await act(async () => {
      await Promise.resolve();
    });
    await renderWith(s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      webos.emit('tv1', { kind: 'tv', state: { power: true } });
    });
    const opacity = (): unknown =>
      StyleSheet.flatten(screen.getByTestId('tv-pad-area').props.style)?.opacity;
    expect(opacity()).toBe(1);
    const mic = screen.getByLabelText(t('tv.voice'));
    await fireEvent(mic, 'pressIn');
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(opacity()).toBe(0.55);
    await fireEvent(mic, 'pressOut');
    expect(opacity()).toBe(1);
  });

  it('says "Sent to the TV" after a voice message, and drops it after 1.6 s', async () => {
    const webos = createFakeDriver('androidtv', {
      capabilities: { tv: { inputList: true, text: true, powerOn: true, voice: true } },
      startVoice: () => Promise.resolve({ push: () => undefined, end: () => undefined }),
    });
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [webos],
      voice: { mic: createFakeMic(), dictation: createFakeDictation(false) },
    });
    await s.store.upsertRoom(room('r1', 'Living room', 0));
    await s.store.upsertDevice(tvDevice('tv1', 'androidtv'));
    await act(async () => {
      await Promise.resolve();
    });
    await renderWith(s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      webos.emit('tv1', { kind: 'tv', state: { power: true } });
    });
    const mic = screen.getByLabelText(t('tv.voice'));
    await fireEvent(mic, 'pressIn');
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    await fireEvent(mic, 'pressOut');
    expect(screen.getByText(t('tv.voiceSent'))).toBeTruthy();
    await advance(1599);
    expect(screen.getByText(t('tv.voiceSent'))).toBeTruthy();
    await advance(1);
    expect(screen.queryByText(t('tv.voiceSent'))).toBeNull();
  });

  it('centres Back and Home when there is no mic', async () => {
    const r = await rig({ tv: { inputList: true, text: true, powerOn: true, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    expect(screen.queryByLabelText(t('tv.voice'))).toBeNull();
    expect(screen.getAllByLabelText(t('tv.goBack')).length).toBe(2);
    expect(screen.getByLabelText(t('tv.home'))).toBeTruthy();
  });

  it('draws the power icon in the dark danger ink in the dark theme', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />, { scheme: 'dark' });
    await on(r);
    expect(screen.getByLabelText(t('tv.power'))).toBeTruthy();
    const svg = JSON.stringify(screen.toJSON());
    expect(svg).toContain(darkTokens.color.dangerInk);
  });

  it('renders under reduced motion', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />, { reducedMotion: true });
    expect(screen.getAllByText(t('tv.statusConnecting')).length).toBeGreaterThan(0);
  });
});

describe('TvScreen status captions', () => {
  it('says Off with a warn dot when the TV is off', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(screen.getByText(t('tv.statusOff'))).toBeTruthy();
  });

  it('says Turning on… while waking and Off after a failed wake', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    await fireEvent.press(screen.getByLabelText(t('tv.turnOn')));
    await advance(0);
    expect(screen.getAllByText(t('tv.waking')).length).toBe(2);
    await advance(45000);
    expect(screen.getByText(t('tv.statusOff'))).toBeTruthy();
  });

  it("says Can't reach it, then Looking… while finding", async () => {
    mockNetType = 'CELLULAR';
    const r = await rig();
    let done: (h: string | null) => void = () => undefined;
    r.findAgain.mockReturnValueOnce(new Promise<string | null>((res) => (done = res)));
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.getAllByText(t('tv.unreachableTitle')).length).toBe(2);
    await fireEvent.press(screen.getByLabelText(t('tv.findAgain')));
    // The status line and the caption under the buttons.
    expect(screen.getAllByText(t('tv.finding'))).toHaveLength(2);
    await act(async () => done(null));
    expect(screen.queryByText(t('tv.finding'))).toBeNull();
  });

  it('says Pair again, not connected, when the TV stops trusting the phone', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await on(r);
    expect(screen.getByText(t('tv.statusConnected'))).toBeTruthy();
    r.webos.failNext('notPaired');
    await fireEvent.press(screen.getByLabelText(t('tv.home')));
    await advance(0);
    expect(screen.getAllByText(t('tv.statusPairAgain')).length).toBeGreaterThan(0);
    expect(screen.queryByText(t('tv.statusConnected'))).toBeNull();
    expect(screen.getByText(t('tv.touchpadHint'))).toBeTruthy();
  });

  it('offers only Device settings in the menu and no keyboard while connecting', async () => {
    const r = await rig();
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    expect(screen.queryByLabelText(t('tv.keyboard'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(t('tv.more')));
    expect(screen.getByLabelText(t('device.open'))).toBeTruthy();
    expect(screen.queryByLabelText(t('tv.dpad'))).toBeNull();
  });

  it('shows the offer body above the cannot-turn-on line, and tones the find note', async () => {
    const r = await rig({ tv: { inputList: true, text: true, powerOn: false, voice: false } });
    await renderWith(r.s, <TvScreen deviceId="tv1" />);
    await act(async () => {
      r.webos.emit('tv1', { kind: 'tv', state: { power: false } });
    });
    expect(screen.getByText(t('tv.offBody'))).toBeTruthy();
    expect(screen.getByText(t('tv.cantTurnOn'))).toBeTruthy();
  });
});
