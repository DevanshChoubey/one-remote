import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { t } from '@/i18n';
import { darkTokens, lightTokens } from '@/theme';
import { DeviceSettingsButton, DeviceSheet } from '@/screens/device';
import { device, makeServices, renderWith, room } from './helpers';

const mockBack = jest.fn();
const mockDismissAll = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, dismissAll: mockDismissAll }),
}));

async function seeded() {
  const s = makeServices();
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  await s.store.upsertRoom(room('r2', 'Living room', 1));
  await s.store.upsertDevice(
    device('d1', 'r1', 0, {
      name: 'Panasonic AC',
      links: [
        { kind: 'webos', host: '192.168.1.23', secure: true, clientKeyRef: 'k' },
        { kind: 'matter', nodeId: 'n' },
        { kind: 'ir', remoteId: 'x/y' },
      ],
    }),
  );
  await s.store.upsertDevice(device('d2', 'r1', 1));
  return s;
}

beforeEach(() => {
  mockBack.mockClear();
  mockDismissAll.mockClear();
  mockPush.mockClear();
});

describe('DeviceSheet as a bottom sheet', () => {
  it('shows the Device removed toast after the sheet closes, and leaves no timer behind', async () => {
    const s = await seeded();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const err = jest.spyOn(console, 'error');
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    expect(await screen.findByTestId('toast')).toBeTruthy();
    expect(screen.getByText(t('device.removed'))).toBeTruthy();
    expect(mockDismissAll).toHaveBeenCalled();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    jest.useRealTimers();
  });

  it('toasts Saved after renaming', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.changeText(await screen.findByDisplayValue('Panasonic AC'), 'Study AC');
    await fireEvent.press(screen.getByLabelText(t('device.saveName')));
    expect(await screen.findByText(t('common.saved'))).toBeTruthy();
  });

  it('draws the remove button on the soft danger background', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    const button = await screen.findByLabelText(t('device.remove'));
    const style = StyleSheet.flatten(button.props.style);
    expect(style.backgroundColor).toBe(lightTokens.color.dangerSoft);
  });

  it('shows the main link as a badge', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    expect(await screen.findByText(t('device.main'))).toBeTruthy();
    expect(screen.getAllByText(t('device.backup'))).toHaveLength(2);
  });

  it('renders on the dark background', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />, { scheme: 'dark', reducedMotion: true });
    await screen.findByText(t('device.main'));
    expect(JSON.stringify(screen.toJSON())).toContain(darkTokens.color.bg);
  });

  it('shows skeleton bars while loading', async () => {
    const s = makeServices();
    jest.spyOn(s.store, 'rooms').mockReturnValue(new Promise(() => undefined));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    expect(screen.getByText(t('device.title'))).toBeTruthy();
    expect(screen.getByTestId('device-skeleton').children).toHaveLength(3);
  });

  it('says the device is gone inside the sheet', async () => {
    await renderWith(makeServices(), <DeviceSheet deviceId="nope" />);
    expect(await screen.findByText(t('home.notFound'))).toBeTruthy();
    expect(screen.getByTestId('device-sheet')).toBeTruthy();
    expect(screen.queryByTestId('device-skeleton')).toBeNull();
  });
});

describe('DeviceSheet', () => {
  it('renames the device', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    const input = await screen.findByDisplayValue('Panasonic AC');
    await fireEvent.changeText(input, 'Study AC');
    await fireEvent.press(screen.getByLabelText(t('device.saveName')));
    await waitFor(async () =>
      expect((await s.store.devices()).find((d) => d.id === 'd1')?.name).toBe('Study AC'),
    );
  });

  it('does not save an empty name', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.changeText(await screen.findByDisplayValue('Panasonic AC'), '  ');
    expect(screen.getByLabelText(t('device.saveName')).props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('moves the device to another room, at the end', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText('Living room'));
    await waitFor(async () => {
      const d = (await s.store.devices()).find((x) => x.id === 'd1');
      expect(d).toMatchObject({ roomId: 'r2', order: 0 });
    });
  });

  it('moves down within the room', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.moveDown')));
    await waitFor(async () => {
      const all = await s.store.devices();
      expect(all.find((x) => x.id === 'd1')?.order).toBe(1);
      expect(all.find((x) => x.id === 'd2')?.order).toBe(0);
    });
  });

  it('asks before removing, then removes', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    expect((await s.store.devices()).length).toBe(2);
    await fireEvent.press(screen.getByLabelText(t('common.cancel')));
    expect((await s.store.devices()).length).toBe(2);
    await fireEvent.press(screen.getByLabelText(t('device.remove')));
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    await waitFor(async () => expect((await s.store.devices()).map((d) => d.id)).toEqual(['d2']));
    expect(mockDismissAll).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('deletes the client key of every webos link when removing, and still removes if that fails', async () => {
    const s = await seeded();
    await s.secrets.set('k', 'secret');
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    await waitFor(async () => expect((await s.store.devices()).map((d) => d.id)).toEqual(['d2']));
    expect(await s.secrets.get('k')).toBeNull();
  });

  it('removes through services.removeDevice, so lane drivers can forget their links', async () => {
    const s = await seeded();
    const removeDevice = jest.spyOn(s, 'removeDevice');
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    await waitFor(async () => expect((await s.store.devices()).map((d) => d.id)).toEqual(['d2']));
    expect(removeDevice).toHaveBeenCalledWith('d1');
  });

  it('removes the device even when deleting the secret fails', async () => {
    const s = await seeded();
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(s.secrets, 'delete').mockRejectedValue(new Error('keystore'));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    await waitFor(async () => expect((await s.store.devices()).map((d) => d.id)).toEqual(['d2']));
    expect(err).toHaveBeenCalled();
    expect(mockDismissAll).toHaveBeenCalled();
    err.mockRestore();
  });

  it('renders a device-level action once', async () => {
    const s = await seeded();
    await renderWith(
      s,
      <DeviceSheet deviceId="d1" deviceActions={[() => <Text>add an IR backup</Text>]} />,
    );
    expect(await screen.findAllByText('add an IR backup')).toHaveLength(1);
  });

  it('DeviceSettingsButton opens the sheet for its device', async () => {
    await renderWith(makeServices(), <DeviceSettingsButton deviceId="d1" />);
    await fireEvent.press(screen.getByLabelText(t('device.open')));
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/d1');
  });

  it('shows Wi-Fi and the host for an Android TV link', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(
      device('d9', 'r1', 0, {
        kind: 'tv',
        links: [{ kind: 'androidtv', host: '10.0.0.9', certRef: 'c', pinSha256: 'p' }],
      }),
    );
    await renderWith(s, <DeviceSheet deviceId="d9" />);
    expect(await screen.findByText('Wi-Fi')).toBeTruthy();
    expect(screen.getAllByText('10.0.0.9').length).toBeGreaterThan(0);
  });

  it('lists the links, the first as main and the others as backup', async () => {
    const s = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    expect(await screen.findByText('Wi-Fi')).toBeTruthy();
    expect(screen.getByText('Matter')).toBeTruthy();
    expect(screen.getByText('IR')).toBeTruthy();
    expect(screen.getByText('192.168.1.23')).toBeTruthy();
    expect(screen.getAllByText(t('device.main')).length).toBe(1);
    expect(screen.getAllByText(t('device.backup')).length).toBe(2);
  });

  it('renders a lane action under its link', async () => {
    const s = await seeded();
    await renderWith(
      s,
      <DeviceSheet
        deviceId="d1"
        linkActions={[({ link }) => (link.kind === 'ir' ? <Text>redo the IR test</Text> : null)]}
      />,
    );
    expect(await screen.findByText('redo the IR test')).toBeTruthy();
  });

  it('says so when the device is gone', async () => {
    await renderWith(makeServices(), <DeviceSheet deviceId="nope" />);
    expect(await screen.findByText(t('home.notFound'))).toBeTruthy();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
