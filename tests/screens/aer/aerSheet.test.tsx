import { act, fireEvent, screen } from '@testing-library/react-native';
import type { FakeAerService } from '@/aer/testing/fakeAerService';
import { t } from '@/i18n';
import { DeviceSheet } from '@/screens/device';
import { AerError, refillPercent } from '@/services';
import { darkTokens } from '@/theme';
import { device, makeServices, renderWith, room, surfaceStyle } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const mockBack = jest.fn();
const mockDismissAll = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, dismissAll: mockDismissAll }),
}));

async function seeded() {
  const s = makeServices();
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  await s.store.upsertDevice(
    device('d1', 'r1', 0, {
      kind: 'aer',
      name: 'Hall freshener',
      links: [{ kind: 'aer', bleId: 'AA:BB', timeZone: 'Asia/Kolkata' }],
    }),
  );
  const aer = s.aer as FakeAerService;
  aer.setView({
    deviceId: 'd1',
    status: {
      batteryMv: 3000,
      firmware: '1',
      autoSpray: null,
      scheduleRunning: false,
      spraysSinceRefill: 3,
      at: new Date().toISOString(),
    },
  });
  return { s, aer };
}

beforeEach(() => {
  mockBack.mockClear();
  mockDismissAll.mockClear();
  mockPush.mockClear();
});

describe('aer device sheet', () => {
  it('shows the aer rows and Bluetooth as the link', async () => {
    const { s } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    expect(await screen.findByText(t('aer.refilled'))).toBeTruthy();
    expect(screen.getByText(t('aer.refilledSub', { refill: refillPercent(3) }))).toBeTruthy();
    expect(screen.getByText(t('aer.findIt'))).toBeTruthy();
    expect(screen.getByText(t('aer.zoneRow'))).toBeTruthy();
    expect(
      screen.getByText(t('aer.zoneSub', { zone: 'India · Kolkata', offset: 'UTC+5:30' })),
    ).toBeTruthy();
    expect(screen.getByText(t('device.linkBluetooth'))).toBeTruthy();
    expect(screen.getByText(t('aer.linkSub'))).toBeTruthy();
  });

  it('I refilled it asks once, then resets', async () => {
    const { s, aer } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.refilled')));
    expect(screen.getByText(t('aer.refillTitle'))).toBeTruthy();
    expect(screen.getByText(t('aer.refillBody'))).toBeTruthy();
    expect(aer.calls.some((c) => c.op === 'resetRefill')).toBe(false);
    await fireEvent.press(screen.getByLabelText(t('aer.refillYes')));
    expect(await screen.findByText('Refill set to 100%')).toBeTruthy();
    expect(aer.calls.filter((c) => c.op === 'resetRefill')).toEqual([
      { op: 'resetRefill', deviceId: 'd1' },
    ]);
    expect(screen.queryByText(t('aer.refillTitle'))).toBeNull();
  });

  it('Cancel on the refill confirm restores the sheet', async () => {
    const { s, aer } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.refilled')));
    await fireEvent.press(screen.getByLabelText(t('common.cancel')));
    expect(screen.getByText(t('aer.findIt'))).toBeTruthy();
    expect(aer.calls.some((c) => c.op === 'resetRefill')).toBe(false);
  });

  it('a failed reset says why and stays on the confirm', async () => {
    const { s, aer } = await seeded();
    aer.failNext('resetRefill', new AerError('bluetoothOff'));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.refilled')));
    await fireEvent.press(screen.getByLabelText(t('aer.refillYes')));
    expect(await screen.findByText(t('aer.probBtOff'))).toBeTruthy();
    expect(screen.getByText(t('aer.refillTitle'))).toBeTruthy();
  });

  it('Find it blinks the light', async () => {
    const { s, aer } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.findIt')));
    expect(await screen.findByText(t('aer.blinkToast'))).toBeTruthy();
    expect(aer.calls.filter((c) => c.op === 'blink').map((c) => c.deviceId)).toEqual(['d1']);
  });

  it('Find it shows the problem when the blink fails', async () => {
    const { s, aer } = await seeded();
    aer.failNext('blink', new AerError('unreachable'));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.findIt')));
    expect(await screen.findByText(t('aer.probAway'))).toBeTruthy();
  });

  it('shows a spinner row while the blink is held', async () => {
    const { s, aer } = await seeded();
    const gate = aer.hold('blink');
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.findIt')));
    expect(await screen.findByLabelText(t('aer.findIt'))).toBeDisabled();
    gate.release();
    expect(await screen.findByText(t('aer.blinkToast'))).toBeTruthy();
  });

  it('the time zone row opens the zone screen', async () => {
    const { s } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.zoneRow')));
    expect(mockPush).toHaveBeenCalledWith('/aer/zone/d1');
  });

  it('remove says the dispenser keeps its schedules', async () => {
    const { s, aer } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('device.remove')));
    expect(screen.getByText(t('aer.removeBody'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('device.confirmRemove')));
    expect(await screen.findByText(t('device.removed'))).toBeTruthy();
    expect(aer.calls.some((c) => c.op === 'forget' && c.deviceId === 'd1')).toBe(true);
  });

  it('renders in dark', async () => {
    const { s } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />, { scheme: 'dark' });
    const remove = await screen.findByLabelText(t('device.remove'));
    expect(surfaceStyle(remove).backgroundColor).toBe(darkTokens.color.dangerSoft);
    expect(screen.getByText(t('aer.findIt'))).toBeTruthy();
  });

  it('renders under reduced motion', async () => {
    const { s } = await seeded();
    await renderWith(s, <DeviceSheet deviceId="d1" />, { reducedMotion: true });
    expect(await screen.findByText(t('aer.refilled'))).toBeTruthy();
  });

  it('ignores a blink that finishes after the sheet is gone', async () => {
    const { s, aer } = await seeded();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const gate = aer.hold('blink');
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.findIt')));
    await screen.unmount();
    await act(async () => gate.release());
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('ignores a failed reset that comes back after the sheet is gone', async () => {
    const { s, aer } = await seeded();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const gate = aer.hold('resetRefill');
    aer.failNext('resetRefill', new AerError('unreachable'));
    await renderWith(s, <DeviceSheet deviceId="d1" />);
    await fireEvent.press(await screen.findByLabelText(t('aer.refilled')));
    await fireEvent.press(screen.getByLabelText(t('aer.refillYes')));
    await screen.unmount();
    await act(async () => gate.release());
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
