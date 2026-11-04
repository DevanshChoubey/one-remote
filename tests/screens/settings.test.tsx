import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState, Platform, StyleSheet } from 'react-native';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import type { AlertPermission } from '@/services';
import { openNotificationSettings } from '@/screens/aer/openSettings';
import { t } from '@/i18n';
import { darkTokens, lightTokens } from '@/theme';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { device, makeServices, renderWith, room } from './helpers';

jest.mock('@/screens/aer/openSettings', () => ({
  openNotificationSettings: jest.fn().mockResolvedValue(undefined),
  openBluetoothSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

// The jest AppState returns no subscription, so every render here gets a plain one.
beforeEach(() => {
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((() => ({ remove: jest.fn() })) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('SettingsScreen', () => {
  it('shows the privacy text in a banner, on the dark background', async () => {
    await renderWith(makeServices(), <SettingsScreen />, { scheme: 'dark', reducedMotion: true });
    const row = await screen.findByLabelText(t('settings.privacy'));
    expect(row.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(row);
    expect(screen.getByLabelText(t('settings.privacy')).props.accessibilityState.expanded).toBe(
      true,
    );
    expect(screen.getByText(t('settings.privacyBody'))).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(darkTokens.color.bg);
  });

  it('persists the theme', async () => {
    const s = makeServices();
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.themeDark')));
    await waitFor(async () => expect((await s.prefs.get()).theme).toBe('dark'));
    expect(screen.getByLabelText(t('settings.themeDark')).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('persists the haptics and volume key switches', async () => {
    const was = Platform.OS;
    Platform.OS = 'android';
    try {
      const s = makeServices();
      await renderWith(s, <SettingsScreen />);
      await fireEvent.press(await screen.findByLabelText(t('settings.volumeKeys')));
      await fireEvent.press(screen.getByLabelText(t('settings.haptics')));
      await waitFor(async () => {
        const p = await s.prefs.get();
        expect([p.volumeKeys, p.haptics]).toEqual([false, false]);
      });
    } finally {
      Platform.OS = was;
    }
  });

  it('hides the volume keys row on iOS', async () => {
    const was = Platform.OS;
    Platform.OS = 'ios';
    try {
      await renderWith(makeServices(), <SettingsScreen />);
      await screen.findByLabelText(t('settings.haptics'));
      expect(screen.queryByLabelText(t('settings.volumeKeys'))).toBeNull();
    } finally {
      Platform.OS = was;
    }
  });

  it('renames and reorders rooms from the rooms row', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('a', 'Bedroom', 0));
    await s.store.upsertRoom(room('b', 'Study', 1));
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.rooms')));
    await fireEvent.changeText(
      await screen.findByLabelText(t('settings.roomName', { name: 'Bedroom' })),
      'Master bedroom',
    );
    await fireEvent.press(screen.getByLabelText(t('settings.saveRoom', { name: 'Bedroom' })));
    await waitFor(async () =>
      expect((await s.store.rooms()).find((r) => r.id === 'a')?.name).toBe('Master bedroom'),
    );
    await fireEvent.press(
      screen.getByLabelText(t('settings.roomDown', { name: 'Master bedroom' })),
    );
    await waitFor(async () => {
      const rooms = await s.store.rooms();
      expect(rooms.find((r) => r.id === 'a')?.order).toBe(1);
      expect(rooms.find((r) => r.id === 'b')?.order).toBe(0);
    });
  });

  it('removes an empty room', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('a', 'Bedroom', 0));
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.rooms')));
    await fireEvent.press(
      await screen.findByLabelText(t('settings.removeRoom', { name: 'Bedroom' })),
    );
    await waitFor(async () => expect(await s.store.rooms()).toEqual([]));
  });

  it('refuses to remove a room that still has devices', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('a', 'Bedroom', 0));
    await s.store.upsertDevice(device('d', 'a', 0));
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.rooms')));
    await fireEvent.press(
      await screen.findByLabelText(t('settings.removeRoom', { name: 'Bedroom' })),
    );
    expect(await screen.findByText(t('settings.roomNotEmpty'))).toBeTruthy();
    expect((await s.store.rooms()).length).toBe(1);
  });

  it("draws a room's up and down as arrow pills, disabled at the ends", async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('a', 'Bedroom', 0));
    await s.store.upsertRoom(room('b', 'Study', 1));
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.rooms')));
    const up = await screen.findByLabelText(t('settings.roomUp', { name: 'Bedroom' }));
    expect(up.props.accessibilityState.disabled).toBe(true);
    expect(screen.getAllByText(t('settings.roomUpGlyph'))).toHaveLength(2);
    expect(screen.getAllByText(t('settings.roomDownGlyph'))).toHaveLength(2);
    expect(
      screen.getByLabelText(t('settings.roomDown', { name: 'Study' })).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('marks the section rows expanded or collapsed', async () => {
    await renderWith(makeServices(), <SettingsScreen />);
    const row = await screen.findByLabelText(t('settings.privacy'));
    expect(row.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(row);
    expect(screen.getByLabelText(t('settings.privacy')).props.accessibilityState.expanded).toBe(
      true,
    );
  });

  it('announces the room error politely', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('a', 'Bedroom', 0));
    await s.store.upsertDevice(device('d', 'a', 0));
    await renderWith(s, <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.rooms')));
    await fireEvent.press(
      await screen.findByLabelText(t('settings.removeRoom', { name: 'Bedroom' })),
    );
    const msg = await screen.findByText(t('settings.roomNotEmpty'));
    expect(msg.props.accessibilityLiveRegion).toBe('polite');
    // Mock: a plain muted status sentence, not a red error line.
    expect(StyleSheet.flatten(msg.props.style).color).toBe(lightTokens.color.ink2);
  });

  it('shows the privacy text', async () => {
    await renderWith(makeServices(), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.privacy')));
    expect(screen.getByText(t('settings.privacyBody'))).toBeTruthy();
  });

  it('lists the licences, with the LGPL notice', async () => {
    await renderWith(makeServices(), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.about')));
    expect(screen.getByText('IR encoders: IRremoteESP8266, LGPL-2.1')).toBeTruthy();
    expect(screen.getByText('Fan IR codes: MIT licence')).toBeTruthy();
    expect(screen.getByText(/devanshc13@gmail\.com/)).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/SmartIR/i);
    expect(screen.getByText(t('settings.licenseOss'))).toBeTruthy();
  });
});

describe('Alerts in Settings', () => {
  const groups = [
    ['refill', 'settings.alertRefill'],
    ['battery', 'settings.alertBattery'],
    ['checkIn', 'settings.alertCheckIn'],
  ] as const;

  it('shows the three alert switches, on by default', async () => {
    await renderWith(makeServices(), <SettingsScreen />);
    expect(await screen.findByText(t('settings.alerts'))).toBeTruthy();
    for (const [, key] of groups) {
      const sw = await screen.findByLabelText(t(key));
      expect(sw.props.accessibilityState.checked).toBe(true);
      expect(sw.props.accessibilityState.disabled).toBeFalsy();
    }
    expect(screen.getByText(t('settings.alertRefillSub'))).toBeTruthy();
    expect(screen.queryByText(t('settings.notificationsOff'))).toBeNull();
  });

  it('turning one off turns off only that group', async () => {
    const alerts = createFakeAlerts();
    const set = jest.spyOn(alerts, 'setSwitch');
    await renderWith(makeServices([], { aerAlerts: alerts }), <SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(t('settings.alertBattery')));
    await waitFor(() => expect(set).toHaveBeenCalledWith('battery', false));
    expect(set).toHaveBeenCalledTimes(1);
    expect(await alerts.switches()).toEqual({ refill: true, battery: false, checkIn: true });
    await waitFor(() =>
      expect(
        screen.getByLabelText(t('settings.alertBattery')).props.accessibilityState.checked,
      ).toBe(false),
    );
    expect(screen.getByLabelText(t('settings.alertRefill')).props.accessibilityState.checked).toBe(
      true,
    );
  });

  it('notifications refused dims the switches and says where', async () => {
    const alerts = createFakeAlerts({ permission: 'denied' });
    const set = jest.spyOn(alerts, 'setSwitch');
    await renderWith(makeServices([], { aerAlerts: alerts }), <SettingsScreen />);
    expect(await screen.findByText(t('settings.notificationsOff'))).toBeTruthy();
    const sw = screen.getByLabelText(t('settings.alertRefill'));
    expect(sw.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(sw);
    expect(set).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(t('settings.openSettings')));
    expect(openNotificationSettings).toHaveBeenCalled();
  });

  it('reads the permission again when the app becomes active', async () => {
    let perm: AlertPermission = 'denied';
    const alerts = createFakeAlerts();
    alerts.permission = async () => perm;
    let listener: ((s: string) => void) | undefined;
    const remove = jest.fn();
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: (s: string) => void,
    ) => {
      listener = cb;
      return { remove };
    }) as never);
    try {
      await renderWith(makeServices([], { aerAlerts: alerts }), <SettingsScreen />);
      expect(await screen.findByText(t('settings.notificationsOff'))).toBeTruthy();
      perm = 'granted';
      await act(async () => listener?.('background'));
      expect(screen.getByText(t('settings.notificationsOff'))).toBeTruthy();
      await act(async () => listener?.('active'));
      await waitFor(() => expect(screen.queryByText(t('settings.notificationsOff'))).toBeNull());
      await screen.unmount();
      expect(remove).toHaveBeenCalled();
    } finally {
      add.mockRestore();
    }
  });

  it('privacy names Bluetooth', async () => {
    await renderWith(makeServices(), <SettingsScreen />);
    expect(await screen.findByText('Home network and Bluetooth only')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('settings.privacy')));
    expect(screen.getByText(t('settings.privacyBody'))).toBeTruthy();
    expect(screen.getByText(/over Bluetooth/)).toBeTruthy();
  });

  it('renders in dark, and with reduced motion, with the alerts denied', async () => {
    const alerts = createFakeAlerts({ permission: 'denied' });
    await renderWith(makeServices([], { aerAlerts: alerts }), <SettingsScreen />, {
      scheme: 'dark',
      reducedMotion: true,
    });
    expect(await screen.findByText(t('settings.notificationsOff'))).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(darkTokens.color.bg);
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
