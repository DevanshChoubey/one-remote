import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { FoundTv, PairedTv } from '@/core';
import { DeviceError, PairError } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { AddTvFlow } from '@/screens/add/tv/AddTvFlow';
import { createServices } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { fakeTvSetup } from '../fakeTvSetup';
import type { FakeTvSetup } from '../fakeTvSetup';
import { renderWith, room } from '../helpers';

jest.mock('react-native-udp');
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: mockReplace,
    dismissAll: mockDismissAll,
  }),
}));

const lg: FoundTv = { host: '192.168.1.23', name: 'LG OLED C4', secure: true, usn: 'u1' };
const paired = (mac = 'AA:BB:CC:DD:EE:FF'): PairedTv => ({
  link: { kind: 'webos', host: lg.host, mac, secure: true, clientKeyRef: 'key-new' },
  suggestedName: 'LG OLED C4',
});

interface Rig {
  s: Services;
  setup: FakeTvSetup;
  found: (tv: FoundTv) => Promise<void>;
  stopped: jest.Mock;
}

async function rig(opts: { ir?: boolean } = {}): Promise<Rig> {
  const fake = fakeTvSetup();
  const { setup } = fake;
  setup.probeHost.mockResolvedValue(lg);
  setup.pair.mockImplementation((_tv, onPrompt) => {
    onPrompt();
    return Promise.resolve(paired());
  });
  const drivers = [
    createFakeDriver('webos'),
    createFakeDriver('ir', { available: opts.ir ?? true }),
  ];
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
    tv: setup,
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  return { s, setup, stopped: fake.stopped, found: (tv) => act(async () => fake.found(tv)) };
}

const hang = (): Promise<PairedTv> => new Promise(() => undefined);

const toFind = async (): Promise<void> => {
  await fireEvent.press(screen.getByLabelText(t('addTv.brandLg')));
};

beforeEach(() => {
  mockReplace.mockClear();
  mockDismissAll.mockClear();
});

describe('Add TV flow', () => {
  it('offers LG and shows the other brands as not yet supported', async () => {
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    expect(screen.getByText(t('addTv.brandLgNote'))).toBeTruthy();
    expect(screen.getByText(t('addTv.brandOtherNote'))).toBeTruthy();
    const other = screen.getByLabelText(t('addTv.brandOther'));
    expect(other.props.accessibilityState.disabled).toBe(true);
    await toFind();
    expect(screen.getByText(t('addTv.findTitle'))).toBeTruthy();
  });

  it('lists TVs as they are found and stops looking when the step is left', async () => {
    const r = await rig();
    r.setup.pair.mockImplementationOnce(hang);
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    expect(screen.queryByText('LG OLED C4')).toBeNull();
    await r.found(lg);
    expect(screen.getByText('LG OLED C4')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(screen.getByText(t('addTv.pairAllow'))).toBeTruthy();
    expect(r.stopped).toHaveBeenCalled();
  });

  it('checks the typed IP address', async () => {
    const r = await rig();
    r.setup.pair.mockImplementationOnce(hang);
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await fireEvent.press(screen.getByLabelText(t('addTv.cantFind')));
    const field = screen.getByLabelText(t('addTv.ipLabel'));

    await fireEvent.changeText(field, '300.1.1.1');
    await fireEvent.press(screen.getByLabelText(t('addTv.ipFind')));
    expect(screen.getByText(t('addTv.badIp'))).toBeTruthy();
    expect(r.setup.probeHost).not.toHaveBeenCalled();

    r.setup.probeHost.mockRejectedValueOnce(new DeviceError('notLocal'));
    await fireEvent.changeText(field, '8.8.8.8');
    await fireEvent.press(screen.getByLabelText(t('addTv.ipFind')));
    expect(await screen.findByText(t('addTv.notLocal'))).toBeTruthy();

    r.setup.probeHost.mockResolvedValueOnce(null);
    await fireEvent.changeText(field, '192.168.1.99');
    await fireEvent.press(screen.getByLabelText(t('addTv.ipFind')));
    expect(await screen.findByText(t('addTv.noAnswer'))).toBeTruthy();

    await fireEvent.changeText(field, '192.168.1.23');
    await fireEvent.press(screen.getByLabelText(t('addTv.ipFind')));
    expect(await screen.findByText(t('addTv.pairAllow'))).toBeTruthy();
  });

  it('says no on a denied prompt and pairs again on Try again', async () => {
    const r = await rig();
    r.setup.pair.mockRejectedValueOnce(new PairError('denied'));
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByText(t('addTv.denied'))).toBeTruthy();
    expect(r.setup.pair).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText(t('addTv.tryAgain')));
    await waitFor(() => expect(r.setup.pair).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue('LG OLED C4')).toBeTruthy();
  });

  it('counts down while waiting for the prompt', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const r = await rig();
      r.setup.pair.mockImplementationOnce(hang);
      await renderWith(r.s, <AddTvFlow />);
      await toFind();
      await r.found(lg);
      await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
      expect(screen.getByText(t('addTv.waiting', { seconds: 60 }))).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText(t('addTv.waiting', { seconds: 57 }))).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('saves the Wi-Fi link and an IR backup on a phone with IR', async () => {
    const r = await rig({ ir: true });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByDisplayValue('LG OLED C4')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('common.done')));
    await waitFor(async () => expect(await r.s.store.devices()).toHaveLength(1));
    const [device] = await r.s.store.devices();
    expect(device?.kind).toBe('tv');
    expect(device?.links).toEqual([paired().link, { kind: 'ir', remoteId: 'lg-tv/nec' }]);
  });

  it('saves only the Wi-Fi link on a phone without IR', async () => {
    const r = await rig({ ir: false });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    await screen.findByDisplayValue('LG OLED C4');
    await fireEvent.press(screen.getByLabelText(t('common.done')));
    await waitFor(async () => expect(await r.s.store.devices()).toHaveLength(1));
    expect((await r.s.store.devices())[0]?.links).toEqual([paired().link]);
  });

  it('does not add a TV that is already there, and opens the existing one', async () => {
    const r = await rig();
    await r.s.store.upsertDevice({
      id: 'old',
      kind: 'tv',
      name: 'LG OLED C4',
      roomId: 'r1',
      order: 0,
      links: [{ ...paired().link, clientKeyRef: 'key-old' }],
    });
    await r.s.secrets.set('key-new', 'x');
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByText(t('addTv.duplicate', { name: 'LG OLED C4' }))).toBeTruthy();
    expect(await r.s.store.devices()).toHaveLength(1);
    await waitFor(async () => expect(await r.s.secrets.get('key-new')).toBeNull());
    await fireEvent.press(screen.getByLabelText(t('addTv.openIt')));
    expect(mockReplace).toHaveBeenCalledWith('/device/old');
  });
});
