import { act, fireEvent, screen } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { FakeAerService } from '@/aer/testing/fakeAerService';
import { t } from '@/i18n';
import { AerScreen } from '@/screens/aer/AerScreen';
import { AerError } from '@/services';
import type { AerSchedule as Schedule, AerView } from '@/services';
import { makeServices, renderWith } from '../helpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));
const mockOpenBluetooth = jest.fn(async () => undefined);
jest.mock('@/screens/aer/openSettings', () => ({
  openBluetoothSettings: () => mockOpenBluetooth(),
  openNotificationSettings: jest.fn(async () => undefined),
}));

const HOUR = 3_600_000;
const reading = (
  over: { mv?: number; sprays?: number; ageMs?: number; auto?: 10 | 20 | 40 | null } = {},
  schedules: Schedule[] = [],
): AerView => ({
  deviceId: 'a1',
  status: {
    batteryMv: over.mv ?? 2900,
    firmware: '2.1.4',
    autoSpray: over.auto === undefined ? null : over.auto,
    scheduleRunning: false,
    spraysSinceRefill: over.sprays ?? 700,
    at: new Date(Date.now() - (over.ageMs ?? 0)).toISOString(),
  },
  schedules: { list: schedules, at: new Date().toISOString() },
});
const sch = (from: number, to: number): Schedule => ({
  start: { h: from, m: 0 },
  end: { h: to, m: 0 },
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  interval: 20,
});

function setup(view: AerView = reading(), onOpenSettings?: () => void) {
  const aer: FakeAerService = createFakeAerService({ views: { a1: view } });
  const services = makeServices([], { aer });
  const ui = <AerScreen deviceId="a1" onOpenSettings={onOpenSettings} />;
  return { aer, services, ui };
}

beforeEach(() => mockPush.mockClear());

describe('AerScreen', () => {
  it('connects on open, then shows what it read', async () => {
    const { aer, services, ui } = setup();
    const gate = aer.hold('refresh');
    await renderWith(services, ui);
    expect(screen.getByText('Connecting…')).toBeTruthy();
    expect(screen.getByTestId('aer-battery-loading')).toBeTruthy();
    expect(screen.getByTestId('aer-refill-loading')).toBeTruthy();
    expect(aer.calls).toContainEqual({ op: 'refresh', deviceId: 'a1' });
    await act(async () => gate.release());
    expect(await screen.findAllByText('Read just now')).toBeTruthy();
    expect(screen.getByText('Firmware 2.1.4 · Read just now')).toBeTruthy();
    expect(screen.queryByTestId('aer-battery-loading')).toBeNull();
    expect(screen.getByText('71%')).toBeTruthy();
  });

  it.each([
    ['btoff', new AerError('bluetoothOff'), 'aer.probBtOff'],
    ['away', new AerError('unreachable'), 'aer.probAway'],
    ['busy', new AerError('busy'), 'aer.probBusy'],
    ['denied', new AerError('permissionDenied'), 'aer.probDenied'],
  ])('%s shows its banner, keeps the cached reading and disables Spray', async (_n, err, key) => {
    const { aer, services, ui } = setup(reading({ ageMs: 2 * HOUR }));
    aer.failNext('refresh', err);
    await renderWith(services, ui);
    expect(await screen.findByText(t(key))).toBeTruthy();
    expect(screen.getByText('Firmware 2.1.4 · Last read 2 h ago')).toBeTruthy();
    const disc = screen.getByTestId('aer-spray');
    expect(disc.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(disc);
    expect(aer.calls.filter((c) => c.op === 'sprayNow')).toEqual([]);
    expect(
      screen.getByRole('switch', { name: 'Auto spray' }).props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('flat from a fresh reading shows the banner and disables Spray', async () => {
    const { services, ui } = setup(reading({ mv: 2350 }));
    await renderWith(services, ui);
    expect(await screen.findByText(t('aer.probFlat'))).toBeTruthy();
    expect(screen.getByTestId('aer-spray').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Batteries flat')).toBeTruthy();
  });

  it('a stale flat reading says when it was read and leaves Spray enabled', async () => {
    const { aer, services, ui } = setup(reading({ mv: 2350, ageMs: 3 * HOUR }));
    await renderWith(services, ui);
    expect(await screen.findByText('Firmware 2.1.4 · Last read 3 h ago')).toBeTruthy();
    expect(screen.queryByText(t('aer.probFlat'))).toBeNull();
    const disc = screen.getByTestId('aer-spray');
    expect(disc.props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(disc);
    expect(aer.calls).toContainEqual({ op: 'sprayNow', deviceId: 'a1' });
  });

  it('a low refill shows the warm banner and still sprays', async () => {
    const { services, ui } = setup(reading({ sprays: 2100 }));
    await renderWith(services, ui);
    expect(await screen.findByText(t('aer.lowBanner'))).toBeTruthy();
    expect(screen.getByTestId('aer-spray').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('Open Settings shows for Bluetooth off and calls the prop', async () => {
    const onOpenSettings = jest.fn();
    const { aer, services, ui } = setup(reading(), onOpenSettings);
    aer.failNext('refresh', new AerError('bluetoothOff'));
    await renderWith(services, ui);
    await fireEvent.press(await screen.findByRole('button', { name: t('aer.openSettings') }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('Open Settings with no prop opens the Bluetooth settings', async () => {
    mockOpenBluetooth.mockClear();
    const { aer, services, ui } = setup();
    aer.failNext('refresh', new AerError('bluetoothOff'));
    await renderWith(services, ui);
    await fireEvent.press(await screen.findByRole('button', { name: t('aer.openSettings') }));
    expect(mockOpenBluetooth).toHaveBeenCalledTimes(1);
  });

  it('has no Open Settings for out of range', async () => {
    const { aer, services, ui } = setup();
    aer.failNext('refresh', new AerError('unreachable'));
    await renderWith(services, ui);
    await screen.findByText(t('aer.probAway'));
    expect(screen.queryByRole('button', { name: t('aer.openSettings') })).toBeNull();
  });

  it('Try again connects again', async () => {
    const { aer, services, ui } = setup();
    aer.failNext('refresh', new AerError('unreachable'));
    await renderWith(services, ui);
    await fireEvent.press(await screen.findByRole('button', { name: t('aer.tryAgain') }));
    expect(await screen.findAllByText('Read just now')).toBeTruthy();
    expect(aer.calls.filter((c) => c.op === 'refresh')).toHaveLength(2);
    expect(screen.queryByText(t('aer.probAway'))).toBeNull();
  });

  it('a retry that fails differently clears the old banner and toasts', async () => {
    const { aer, services, ui } = setup();
    aer.failNext('refresh', new AerError('bluetoothOff'));
    aer.failNext('refresh', new AerError('rejected'));
    await renderWith(services, ui);
    await screen.findByText(t('aer.probBtOff'));
    await fireEvent.press(screen.getByRole('button', { name: t('aer.tryAgain') }));
    expect(await screen.findByText(t('aer.probFailed'))).toBeTruthy();
    expect(screen.queryByText(t('aer.probBtOff'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('aer.openSettings') })).toBeNull();
  });

  it('labels a reading with its time when the refresh failed', async () => {
    const { aer, services, ui } = setup(reading({ ageMs: 30 * 60_000 }));
    aer.failNext('refresh', new AerError('rejected'));
    await renderWith(services, ui);
    await screen.findByText(t('aer.probFailed'));
    expect(screen.getAllByText('Last read 30 min ago')).toHaveLength(1);
    expect(screen.getByText('Firmware 2.1.4 · Last read 30 min ago')).toBeTruthy();
    expect(screen.queryByText('Read just now')).toBeNull();
  });

  it('sprays and says so', async () => {
    const { aer, services, ui } = setup();
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    const gate = aer.hold('sprayNow');
    await fireEvent.press(screen.getByTestId('aer-spray'));
    expect(screen.getAllByText('Spraying…').length).toBeGreaterThan(0);
    await act(async () => gate.release());
    expect(await screen.findByText(t('aer.sprayed'))).toBeTruthy();
  });

  it('auto spray off hides the intervals', async () => {
    const { services, ui } = setup(reading({ auto: null }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    expect(screen.getByText(t('aer.autoOff'))).toBeTruthy();
    expect(screen.queryByRole('togglebutton', { name: '40 min' })).toBeNull();
  });

  it('turning auto spray on sets 20 minutes', async () => {
    const { aer, services, ui } = setup(reading({ auto: null }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    await fireEvent.press(screen.getByRole('switch', { name: 'Auto spray' }));
    expect(aer.calls).toContainEqual({ op: 'setAutoSpray', deviceId: 'a1', arg: 20 });
    expect(await screen.findByRole('togglebutton', { name: '40 min' })).toBeTruthy();
  });

  it('picking 40 min sets auto spray', async () => {
    const { aer, services, ui } = setup(reading({ auto: 20 }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    expect(screen.getByText('Every 20 minutes')).toBeTruthy();
    await fireEvent.press(screen.getByRole('togglebutton', { name: '40 min' }));
    expect(aer.calls).toContainEqual({ op: 'setAutoSpray', deviceId: 'a1', arg: 40 });
  });

  it('turning auto spray off sends null', async () => {
    const { aer, services, ui } = setup(reading({ auto: 10 }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    await fireEvent.press(screen.getByRole('switch', { name: 'Auto spray' }));
    expect(aer.calls).toContainEqual({ op: 'setAutoSpray', deviceId: 'a1', arg: null });
  });

  it('says when auto spray turned on or off, but not for a new interval', async () => {
    const { aer, services, ui } = setup(reading({ auto: null }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    await fireEvent.press(screen.getByRole('switch', { name: 'Auto spray' }));
    expect(await screen.findByText(t('aer.autoOnToast'))).toBeTruthy();
    expect(t('aer.autoOnToast')).toBe('Auto spray on');
    await fireEvent.press(await screen.findByRole('togglebutton', { name: '40 min' }));
    expect(aer.calls).toContainEqual({ op: 'setAutoSpray', deviceId: 'a1', arg: 40 });
    expect(screen.queryByText(t('aer.autoOffToast'))).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: 'Auto spray' }));
    expect(await screen.findByText(t('aer.autoOffToast'))).toBeTruthy();
    expect(t('aer.autoOffToast')).toBe('Auto spray off');
  });

  it('a running schedule toasts why auto spray stayed off', async () => {
    const { aer, services, ui } = setup(reading({ auto: null }));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    aer.failNext('setAutoSpray', new AerError('rejected', 'scheduleRunning'));
    await fireEvent.press(screen.getByRole('switch', { name: 'Auto spray' }));
    expect(await screen.findByText(t('aer.probScheduleRunning'))).toBeTruthy();
  });

  it('lists schedules and opens one', async () => {
    const { services, ui } = setup(reading({}, [sch(6, 8), sch(18, 22)]));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    expect(screen.getByText('2 of 10')).toBeTruthy();
    expect(screen.getByText('6:00 am to 8:00 am')).toBeTruthy();
    expect(screen.getByText('Every day · every 20 min · 7 sprays')).toBeTruthy();
    await fireEvent.press(screen.getByText('6:00 pm to 10:00 pm'));
    expect(mockPush).toHaveBeenCalledWith('/aer/schedule/a1?index=1');
  });

  it('says there are no schedules and adds one', async () => {
    const { services, ui } = setup();
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    expect(screen.getByText(t('aer.noSchedules'))).toBeTruthy();
    expect(screen.getByText('0 of 10')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t('aer.addSchedule') }));
    expect(mockPush).toHaveBeenCalledWith('/aer/schedule/a1');
  });

  it('10 schedules disables Add schedule and says why', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => sch(i, i + 1));
    const { services, ui } = setup(reading({}, ten));
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    expect(
      screen.getByRole('button', { name: t('aer.addSchedule') }).props.accessibilityState?.disabled,
    ).toBe(true);
    expect(screen.getByText(t('aer.scheduleFull', { max: 10 }))).toBeTruthy();
    expect(screen.getByText('10 of 10')).toBeTruthy();
  });

  it('the link line opens the device settings', async () => {
    const { services, ui } = setup();
    await renderWith(services, ui);
    await fireEvent.press(screen.getByRole('button', { name: t('aer.linkReady') }));
    expect(mockPush).toHaveBeenCalledWith('/device-sheet/a1');
  });

  it('the link line turns warm when Bluetooth is off', async () => {
    const { aer, services, ui } = setup();
    aer.failNext('refresh', new AerError('bluetoothOff'));
    await renderWith(services, ui);
    expect(await screen.findByRole('button', { name: t('aer.linkOff') })).toBeTruthy();
  });

  it('unmount while spraying leaves no error and no toast', async () => {
    const { aer, services, ui } = setup();
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderWith(services, ui);
    await screen.findAllByText('Read just now');
    const gate = aer.hold('sprayNow');
    await fireEvent.press(screen.getByTestId('aer-spray'));
    await screen.unmount();
    await act(async () => gate.release());
    expect(err).not.toHaveBeenCalled();
    expect(screen.queryByText(t('aer.sprayed'))).toBeNull();
    err.mockRestore();
  });

  it('renders in dark', async () => {
    const { services, ui } = setup();
    await renderWith(services, ui, { scheme: 'dark' });
    expect(await screen.findAllByText('Read just now')).toBeTruthy();
  });

  it('renders under reduced motion', async () => {
    const { services, ui } = setup(reading({ auto: 20 }));
    await renderWith(services, ui, { reducedMotion: true });
    expect(await screen.findByRole('togglebutton', { name: '40 min' })).toBeTruthy();
  });
});
