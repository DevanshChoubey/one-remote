import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { defaultAcState } from '@/core';
import type { Device, Room } from '@/core';
import { t } from '@/i18n';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { ThemeProvider } from '@/theme';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemorySecretStore } from '@/store/secrets';
import { createMemoryPreferenceStore } from '@/store/preferences';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const rooms: Room[] = [
  { id: 'bed', name: 'Bedroom', order: 1 },
  { id: 'liv', name: 'Living room', order: 0 },
];
const dev = (
  id: string,
  kind: Device['kind'],
  roomId: string,
  order: number,
  links: Device['links'],
): Device => ({
  id,
  kind,
  name: `Name ${id}`,
  roomId,
  order,
  links,
});
const ir = { kind: 'ir', remoteId: 'x/y' } as const;
const matter = { kind: 'matter', nodeId: 'n' } as const;

function setup(
  opts: { irAvailable?: boolean } = {},
): Services & { matterDriver: ReturnType<typeof createFakeDriver> } {
  const matterDriver = createFakeDriver('matter');
  const irDriver = createFakeDriver('ir', { available: opts.irAvailable ?? true });
  const services = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [matterDriver, irDriver],
  });
  return { ...services, matterDriver };
}

async function renderHome(s: Services): Promise<void> {
  await render(
    <ThemeProvider scheme="light">
      <ServicesProvider services={s}>
        <HomeScreen />
      </ServicesProvider>
    </ThemeProvider>,
  );
}

async function seed(s: Services, devices: Device[]): Promise<void> {
  for (const r of rooms) await s.store.upsertRoom(r);
  for (const d of devices) await s.store.upsertDevice(d);
}

beforeEach(() => mockPush.mockClear());

describe('HomeScreen', () => {
  it('shows the welcome state when there are no devices', async () => {
    const s = setup();
    await renderHome(s);
    expect(await screen.findByText(t('home.welcomeTitle'))).toBeTruthy();
    expect(screen.getByText('One Remote')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('home.addFirst')));
    expect(mockPush).toHaveBeenCalledWith('/add');
  });

  it('groups devices by room order, cards in order', async () => {
    const s = setup();
    await seed(s, [
      dev('b', 'ac', 'bed', 0, [matter]),
      dev('l2', 'fan', 'liv', 1, [matter]),
      dev('l1', 'tv', 'liv', 0, [matter]),
    ]);
    await renderHome(s);
    await screen.findByText('Living room');
    const texts = screen.getAllByText(/^(Living room|Bedroom|Name )/).map((n) => n.props.children);
    expect(texts).toEqual(['Living room', 'Name l1', 'Name l2', 'Bedroom', 'Name b']);
  });

  it('disables an IR-only device without an IR blaster and shows the banner once', async () => {
    const s = setup({ irAvailable: false });
    await seed(s, [dev('i1', 'tv', 'liv', 0, [ir]), dev('i2', 'fan', 'liv', 1, [ir])]);
    await renderHome(s);
    await screen.findByText('Name i1');
    expect(screen.getAllByText(t('home.needsIr'))).toHaveLength(2);
    expect(screen.getAllByText(t('home.noIrBanner'))).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Name i1'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens a usable device', async () => {
    const s = setup();
    await seed(s, [dev('l1', 'tv', 'liv', 0, [matter])]);
    await renderHome(s);
    await fireEvent.press(await screen.findByLabelText('Name l1'));
    expect(mockPush).toHaveBeenCalledWith('/device/l1');
  });

  it('flips power from the last known state with the AC toggle', async () => {
    const s = setup();
    await seed(s, [dev('a1', 'ac', 'liv', 0, [matter])]);
    await renderHome(s);
    const toggle = await screen.findByLabelText(t('home.power', { name: 'Name a1' }));
    await fireEvent.press(toggle);
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(1));
    expect(s.matterDriver.sent[0]?.cmd).toEqual({
      kind: 'ac.set',
      state: { ...defaultAcState(), power: true },
    });
    await fireEvent.press(toggle);
    await waitFor(() => expect(s.matterDriver.sent).toHaveLength(2));
    expect(s.matterDriver.sent[1]?.cmd).toEqual({
      kind: 'ac.set',
      state: { ...defaultAcState(), power: false },
    });
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
