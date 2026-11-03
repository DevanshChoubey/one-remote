import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { device, makeServices, renderWith, room } from './helpers';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('SettingsScreen', () => {
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

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
