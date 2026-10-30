import { act, screen } from '@testing-library/react-native';
import { t } from '@/i18n';
import DeviceRoute from '../../app/device/[id]';
import { device, makeServices, renderWith, room } from '../screens/helpers';

let mockId = 'd1';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() }),
}));

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('app/device/[id]', () => {
  it.each(['tv', 'ac', 'fan'] as const)('renders the %s placeholder for a %s', async (kind) => {
    const s = makeServices();
    await s.store.upsertRoom(room('r1', 'Bedroom', 0));
    await s.store.upsertDevice(device('d1', 'r1', 0, { kind, name: `My ${kind}` }));
    await flush();
    mockId = 'd1';
    await renderWith(s, <DeviceRoute />);
    expect(await screen.findByText(t('home.placeholderBody', { name: `My ${kind}` }))).toBeTruthy();
    expect(screen.getByTestId(`remote-placeholder-${kind}`)).toBeTruthy();
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
    expect(await screen.findByTestId('remote-placeholder-fan')).toBeTruthy();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
