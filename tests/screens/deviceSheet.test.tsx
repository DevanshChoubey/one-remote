import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { t } from '@/i18n';
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
