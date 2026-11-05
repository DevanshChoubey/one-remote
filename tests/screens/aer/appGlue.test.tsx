import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import { AppProviders } from '@/screens/AppProviders';
import { useAerAlertOpen } from '@/screens/aer/useAerAlertOpen';
import { makeServices } from '../helpers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

function Probe(): null {
  useAerAlertOpen();
  return null;
}

let listener: ((s: string) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  remove.mockClear();
  listener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _: string,
    cb: (s: string) => void,
  ) => {
    listener = cb;
    return { remove };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

function setup() {
  const alerts = createFakeAlerts();
  const aer = createFakeAerService();
  const services = makeServices([], { aerAlerts: alerts, aer });
  return { alerts, aer, services };
}

describe('app glue', () => {
  it('starts the alerts once', async () => {
    const { alerts, services } = setup();
    const view = await render(
      <AppProviders services={services}>
        <Probe />
      </AppProviders>,
    );
    expect([alerts.startCalls, alerts.stopCalls]).toEqual([1, 0]);
    await view.unmount();
    expect(alerts.stopCalls).toBe(1);
    expect(remove).toHaveBeenCalled();
  });

  it('closes every session in the background', async () => {
    const { aer, services } = setup();
    await render(<AppProviders services={services}>{null}</AppProviders>);
    await act(async () => listener?.('inactive'));
    expect(aer.calls.map((c) => c.op)).not.toContain('closeAll');
    await act(async () => listener?.('background'));
    expect(aer.calls.map((c) => c.op)).toContain('closeAll');
  });

  it('a tapped alert opens its device', async () => {
    const { alerts, services } = setup();
    const view = await render(
      <AppProviders services={services}>
        <Probe />
      </AppProviders>,
    );
    await act(async () => alerts.opened('d1'));
    expect(mockPush).toHaveBeenCalledWith('/device/d1');
    await act(async () => alerts.opened(null));
    expect(mockReplace).toHaveBeenCalledWith('/');
    await view.unmount();
    await act(async () => alerts.opened('d2'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
