import type { AerProblem, AerView } from '@/services';
import { aerScreenState } from '@/screens/aer/screenState';
import type { AerScreenState } from '@/screens/aer/screenState';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const at = '2026-11-04T12:00:00Z';
const reading = (batteryMv: number, spraysSinceRefill = 0): AerView => ({
  deviceId: 'd1',
  status: {
    batteryMv,
    firmware: '1',
    autoSpray: null,
    scheduleRunning: false,
    spraysSinceRefill,
    at,
  },
});

describe('aerScreenState', () => {
  it.each<[string, AerView, 'connecting' | 'spraying' | null, AerProblem | null, AerScreenState]>([
    ['op beats a problem', reading(2900), 'spraying', 'away', 'spraying'],
    ['connecting op', reading(2900), 'connecting', null, 'connecting'],
    ['btoff', reading(2900), null, 'btoff', 'btoff'],
    ['denied', reading(2900), null, 'denied', 'denied'],
    ['away', reading(2900), null, 'away', 'away'],
    ['busy', reading(2900), null, 'busy', 'busy'],
    ['flat problem', { deviceId: 'd1' }, null, 'flat', 'flat'],
    ['an unlisted problem is ignored', reading(2900), null, 'failed', 'ready'],
    ['problem beats a flat reading', reading(2350), null, 'away', 'away'],
    ['flat reading', reading(2350), null, null, 'flat'],
    ['flat beats low', reading(2350, 2100), null, null, 'flat'],
    ['low refill', reading(2900, 2100), null, null, 'low'],
    ['ready', reading(2900, 700), null, null, 'ready'],
    ['no reading', { deviceId: 'd1' }, null, null, 'ready'],
  ])('%s', (_name, view, op, problem, want) => {
    expect(aerScreenState(view, op, problem)).toBe(want);
  });
});
