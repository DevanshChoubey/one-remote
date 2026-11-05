import 'react-native-gesture-handler/jestSetup';
import { act, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import DeviceRoute from '../../app/device/[id]';
import { device, makeServices, renderWith, room } from '../screens/helpers';

let mockId = 'd1';
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useLocalSearchParams: () => ({ id: mockId }),
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI' },
  useNetworkState: () => ({ type: 'WIFI' }),
}));

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('app/device/[id]', () => {
  it('renders the TV remote for a TV', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(device('d1', 'r1', 0, { kind: 'tv', name: 'My tv' }));
    await flush();
    mockId = 'd1';
    await renderWith(s, <DeviceRoute />);
    expect(await screen.findByTestId('tv-screen')).toBeTruthy();
  });

  it('renders the AC remote for an ac', async () => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(device('d1', 'r1', 0, { kind: 'ac', name: 'My ac' }));
    await flush();
    mockId = 'd1';
    await renderWith(s, <DeviceRoute />);
    expect(await screen.findByLabelText(t('ac.power'))).toBeTruthy();
  });

  it('says the device is gone for an unknown id', async () => {
    const s = makeServices();
    await flush();
    mockId = 'nope';
    await renderWith(s, <DeviceRoute />);
    expect(await screen.findByText(t('home.notFound'))).toBeTruthy();
  });

  it('switches to the device once the hub learns it (cold start)', async () => {
    const s = makeServices();
    mockId = 'd1';
    await renderWith(s, <DeviceRoute />);
    expect(await screen.findByText(t('home.notFound'))).toBeTruthy();
    await act(async () => {
      await s.store.upsertRoom(room('r1', 'Bedroom', 0));
      await s.store.upsertDevice(device('d1', 'r1', 0, { kind: 'fan', name: 'Fan' }));
      await flush();
    });
    expect(await screen.findByLabelText(t('fan.power'))).toBeTruthy();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
