import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { FoundAer } from '@/aer/types';
import { t } from '@/i18n';
import { AddAerFlow } from '@/screens/add/aer/AddAerFlow';
import { SCAN_MS } from '@/screens/add/aer/useAerScan';
import { signalLabel } from '@/screens/add/aer/ScanStep';
import { phoneZone } from '@/screens/add/aer/phoneZone';
import { AerError } from '@/services';
import { makeServices, renderWith } from '../../helpers';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(() => mockBack.mockClear());
// Lets the fake's last emissions land inside act before a test ends.
afterEach(async () => {
  await act(async () => {});
});

describe('AddAerFlow', () => {
  it('needs Android 12', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    expect(screen.getByText(t('add.kindAer'))).toBeTruthy();
    expect(screen.getByText(t('add.needsAndroid12'))).toBeTruthy();
    expect(aer.calls).toEqual([]);
  });

  it('goes back from the gate', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders in dark with reduced motion', async () => {
    const aer = createFakeAerService({ supported: false });
    await renderWith(makeServices([], { aer }), <AddAerFlow />, {
      scheme: 'dark',
      reducedMotion: true,
    });
    expect(screen.getByText(t('add.needsAndroid12'))).toBeTruthy();
    expect(aer.calls).toEqual([]);
  });
});

const SMART: FoundAer = { bleId: 'B', name: 'Smart Matic', rssi: -50 };
const UNNAMED: FoundAer = { bleId: 'A', name: null, rssi: -90 };
const FOUND: FoundAer[] = [SMART, UNNAMED];

const blinks = (aer: ReturnType<typeof createFakeAerService>) =>
  aer.calls.filter((c) => c.op === 'blink');
const scans = (aer: ReturnType<typeof createFakeAerService>) =>
  aer.calls.filter((c) => c.op === 'scan');

describe('looking nearby', () => {
  it('lists first found first', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await screen.findByTestId('aer-found-B');
    const ids = screen.getAllByTestId(/^aer-found-[^-]+$/).map((n) => n.props.testID);
    expect(ids).toEqual(['aer-found-B', 'aer-found-A']);
    expect(screen.getByText(t('aer.unnamed'))).toBeTruthy();
    expect(screen.getByText(t('aer.signalClose'))).toBeTruthy();
    expect(screen.getByText(t('aer.signalFar'))).toBeTruthy();
  });

  it('lists a device reported twice once', async () => {
    const aer = createFakeAerService({ found: [SMART, UNNAMED, SMART] });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await screen.findByTestId('aer-found-A');
    expect(screen.getAllByTestId(/^aer-found-[^-]+$/)).toHaveLength(2);
  });

  it('says Bluetooth is off instead of searching', async () => {
    const aer = createFakeAerService({ found: FOUND });
    aer.failNext('scan', new AerError('bluetoothOff'));
    const open = jest.fn();
    await renderWith(makeServices([], { aer }), <AddAerFlow openBluetoothSettings={open} />);
    expect(await screen.findByText(t('aer.btOffTitle'))).toBeTruthy();
    expect(screen.getByText(t('aer.btOffBody'))).toBeTruthy();
    expect(screen.queryByTestId('radar')).toBeNull();
    await fireEvent.press(screen.getByText(t('aer.openSettings')));
    expect(open).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(t('aer.tryAgain')));
    expect(await screen.findByTestId('aer-found-B')).toBeTruthy();
    expect(scans(aer)).toHaveLength(2);
  });

  it('says Nearby devices is refused', async () => {
    const aer = createFakeAerService();
    aer.failNext('scan', new AerError('permissionDenied'));
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    expect(await screen.findByText(t('aer.deniedTitle'))).toBeTruthy();
    expect(screen.getByText(t('aer.deniedBody'))).toBeTruthy();
  });

  it('nothing found offers Look again', async () => {
    const aer = createFakeAerService();
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    expect(await screen.findByText(t('aer.lookAgain'))).toBeTruthy();
    expect(screen.getByText(t('aer.nothingYet'))).toBeTruthy();
    expect(screen.queryByTestId('radar-ping')).toBeNull();
    await fireEvent.press(screen.getByText(t('aer.lookAgain')));
    expect(scans(aer)).toHaveLength(2);
  });

  it('keeps looking while the scan runs, and calls it a miss after 15 s', async () => {
    jest.useFakeTimers();
    try {
      const aer = createFakeAerService({ found: [SMART] });
      const gate = aer.hold('scan');
      await renderWith(makeServices([], { aer }), <AddAerFlow />);
      expect(screen.getByText(t('aer.looking'))).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(SCAN_MS);
      });
      expect(screen.getByText(t('aer.nothingYet'))).toBeTruthy();
      await act(async () => gate.release());
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops scanning when the screen goes', async () => {
    const stop = jest.fn();
    const base = createFakeAerService({ found: FOUND });
    const scan = base.scan.bind(base);
    const aer = Object.assign(base, {
      scan: (cb: (d: FoundAer) => void, ms: number) => ({ ...scan(cb, ms), stop }),
    });
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await screen.findByTestId('aer-found-B');
    await screen.unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('labels the signal by strength', () => {
    expect(signalLabel(-60)).toBe(t('aer.signalClose'));
    expect(signalLabel(-61)).toBe(t('aer.signalNear'));
    expect(signalLabel(-80)).toBe(t('aer.signalNear'));
    expect(signalLabel(-81)).toBe(t('aer.signalFar'));
    expect(signalLabel(null)).toBe(t('aer.signalFar'));
  });
});

describe('the blink', () => {
  async function pick(aer: ReturnType<typeof createFakeAerService>, id = 'B'): Promise<void> {
    await renderWith(makeServices([], { aer }), <AddAerFlow />);
    await fireEvent.press(await screen.findByTestId(`aer-found-${id}`));
  }

  it('picking a device blinks it, then asks', async () => {
    const aer = createFakeAerService({ found: FOUND });
    const gate = aer.hold('blink');
    await pick(aer);
    expect(await screen.findByText(t('aer.checkTitle'))).toBeTruthy();
    expect(screen.getByText('Smart Matic')).toBeTruthy();
    expect(screen.getByText(t('aer.blinking'))).toBeTruthy();
    await act(async () => gate.release());
    expect(await screen.findByText(t('aer.askTitle'))).toBeTruthy();
    expect(blinks(aer)).toHaveLength(1);
    expect(blinks(aer)[0]).toMatchObject({
      op: 'blink',
      arg: { bleId: 'B', timeZone: phoneZone() },
    });
    expect(screen.getByTestId('blink-art-on')).toBeTruthy();
  });

  it('Blink again blinks once more and says so', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await pick(aer);
    await fireEvent.press(await screen.findByText(t('aer.blinkAgain')));
    expect(await screen.findByText(t('aer.blinkToast'))).toBeTruthy();
    expect(blinks(aer)).toHaveLength(2);
    expect(blinks(aer)[1]?.deviceId).toBe(blinks(aer)[0]?.deviceId);
  });

  it('No goes back to the list', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await pick(aer);
    await fireEvent.press(await screen.findByText(t('aer.noChooseAnother')));
    expect(await screen.findByTestId('aer-found-A')).toBeTruthy();
    expect(scans(aer)).toHaveLength(2);
  });

  it('one tap on Blink again sends one blink', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await pick(aer);
    const again = await screen.findByText(t('aer.blinkAgain'));
    const gate = aer.hold('blink');
    await fireEvent.press(again);
    await fireEvent.press(again);
    await act(async () => gate.release());
    expect(await screen.findByText(t('aer.blinkToast'))).toBeTruthy();
    expect(blinks(aer)).toHaveLength(2);
  });

  it('Yes goes on', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await pick(aer);
    await fireEvent.press(await screen.findByText(t('aer.yesThatOne')));
    expect(screen.queryByText(t('aer.askTitle'))).toBeNull();
  });

  it('not a Smart Matic offers another', async () => {
    const aer = createFakeAerService({ found: FOUND });
    aer.failNext('blink', new AerError('notDispenser'));
    await pick(aer, 'A');
    expect(await screen.findByText(t('aer.notAerTitle'))).toBeTruthy();
    expect(screen.getByText(t('aer.notAerBody'))).toBeTruthy();
    expect(screen.getByLabelText(t('aer.notAerLabel'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('aer.chooseAnother')));
    expect(await screen.findByTestId('aer-found-B')).toBeTruthy();
  });

  it('busy says another phone has it', async () => {
    const aer = createFakeAerService({ found: FOUND });
    aer.failNext('blink', new AerError('busy'));
    await pick(aer);
    expect(await screen.findByText(t('aer.probBusy'))).toBeTruthy();
    expect(screen.getByText(t('aer.checkTitle'))).toBeTruthy();
    expect(screen.getByTestId('blink-art-off')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('aer.tryAgain')));
    expect(await screen.findByText(t('aer.askTitle'))).toBeTruthy();
    expect(blinks(aer)).toHaveLength(2);
  });

  it('Choose another after a failure goes back to the list', async () => {
    const aer = createFakeAerService({ found: FOUND });
    aer.failNext('blink', new AerError('unreachable'));
    await pick(aer);
    await screen.findByText(t('aer.probAway'));
    await fireEvent.press(screen.getByText(t('aer.chooseAnother')));
    expect(await screen.findByTestId('aer-found-B')).toBeTruthy();
  });

  it('back from the blink returns to the list', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await pick(aer);
    await screen.findByText(t('aer.askTitle'));
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(await screen.findByTestId('aer-found-B')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders the blink in dark', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await renderWith(makeServices([], { aer }), <AddAerFlow />, { scheme: 'dark' });
    await fireEvent.press(await screen.findByTestId('aer-found-B'));
    expect(await screen.findByText(t('aer.askTitle'))).toBeTruthy();
    expect(screen.getByTestId('blink-art-on')).toBeTruthy();
  });

  it('keeps the drawn light still with reduced motion', async () => {
    const aer = createFakeAerService({ found: FOUND });
    await renderWith(makeServices([], { aer }), <AddAerFlow />, { reducedMotion: true });
    await fireEvent.press(await screen.findByTestId('aer-found-B'));
    expect(await screen.findByText(t('aer.askTitle'))).toBeTruthy();
    const led = screen.getByTestId('blink-led');
    const style = { ...StyleSheet.flatten(led.props.style), ...led.props.jestAnimatedStyle?.value };
    expect(style.opacity).toBe(1);
  });
});
