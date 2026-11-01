import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { FoundTv, Link, PairedTv } from '@/core';
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

const lg: FoundTv = {
  kind: 'webos',
  host: '192.168.1.23',
  name: 'LG OLED C4',
  secure: true,
  usn: 'u1',
};
const paired = (
  mac = 'AA:BB:CC:DD:EE:FF',
): PairedTv & { link: Extract<Link, { kind: 'webos' }> } => ({
  link: { kind: 'webos', host: lg.host, mac, secure: true, clientKeyRef: 'key-new' },
  suggestedName: 'LG OLED C4',
});

interface Rig {
  s: Services;
  setup: FakeTvSetup;
  found: (tv: FoundTv) => Promise<void>;
  stopped: jest.Mock;
}

const androidtvBrand = {
  kind: 'androidtv' as const,
  labelKey: 'addTv.brandAndroidTv',
  pairing: 'code' as const,
};
const webosBrand = { kind: 'webos' as const, labelKey: 'addTv.brandLg', pairing: 'allow' as const };
const atv: FoundTv = { kind: 'androidtv', host: '192.168.1.20', name: 'Sony', secure: true };

async function rig(opts: { ir?: boolean } = {}): Promise<Rig> {
  const fake = fakeTvSetup();
  const { setup } = fake;
  setup.probeHost.mockResolvedValue(lg);
  setup.pair.mockImplementation((_tv, prompts) => {
    prompts.onAllow();
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
    tvBrands: [webosBrand, androidtvBrand],
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  return { s, setup, stopped: fake.stopped, found: (tv) => act(async () => fake.found(tv)) };
}

const hang = (): Promise<PairedTv> => new Promise(() => undefined);

const toFind = async (): Promise<void> => {
  await fireEvent.press(screen.getByLabelText(t('addTv.findMine')));
};

beforeEach(() => {
  mockReplace.mockClear();
  mockDismissAll.mockClear();
});

describe('Add TV flow', () => {
  it('lists the registered brands and offers the typed address', async () => {
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    expect(screen.getByText(t('addTv.brandLg'))).toBeTruthy();
    expect(screen.getByText(t('addTv.brandAndroidTv'))).toBeTruthy();
    expect(screen.getByLabelText(t('addTv.typeAddress'))).toBeTruthy();
    expect(screen.queryByText('Samsung, Sony, Google TV…')).toBeNull();
    await toFind();
    expect(screen.getByText(t('addTv.findTitle'))).toBeTruthy();
  });

  it('goes to the manual step from the brand step', async () => {
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    await fireEvent.press(screen.getByLabelText(t('addTv.typeAddress')));
    expect(screen.getByText(t('addTv.manualTitle'))).toBeTruthy();
  });

  it('shows the brand word and the same Wi-Fi line on the find step', async () => {
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    expect(screen.getByText(t('addTv.sameWifi'))).toBeTruthy();
    await r.found(atv);
    expect(screen.getByText('Google TV / Android TV · 192.168.1.20')).toBeTruthy();
  });

  describe('code pairing', () => {
    async function toCode(r: Rig, asks: (string | null)[]): Promise<void> {
      r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
        let wrong = false;
        for (;;) {
          const code = await prompts.askCode(wrong);
          asks.push(code);
          if (code === null) throw new PairError('cancelled');
          if (code === 'A1B2C3') return paired();
          wrong = true;
        }
      });
      await renderWith(r.s, <AddTvFlow />);
      await toFind();
      await r.found(atv);
      await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
    }

    it('sends the typed code upper-cased and shows the wrong-code line', async () => {
      const r = await rig();
      const asks: (string | null)[] = [];
      await toCode(r, asks);
      expect(screen.getByText(t('addTv.codeTitle'))).toBeTruthy();
      const field = screen.getByLabelText(t('addTv.codeTitle'));
      expect(field.props.maxLength).toBe(6);
      await fireEvent.changeText(field, 'zzzzzz');
      await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
      expect(await screen.findByText(t('addTv.codeWrong'))).toBeTruthy();
      expect(screen.getByLabelText(t('addTv.codeTitle')).props.value).toBe('');
      await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b2c3');
      await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
      expect(await screen.findByDisplayValue('LG OLED C4')).toBeTruthy();
      expect(asks).toEqual(['ZZZZZZ', 'A1B2C3']);
    });

    it('Back resolves null and leaves the step without an error', async () => {
      const r = await rig();
      const asks: (string | null)[] = [];
      await toCode(r, asks);
      await fireEvent.press(screen.getByLabelText(t('common.back')));
      await waitFor(() => expect(asks).toEqual([null]));
      expect(screen.getByText(t('addTv.findTitle'))).toBeTruthy();
      expect(screen.queryByText(t('addTv.unreachable'))).toBeNull();
    });

    it('runs no countdown timer on the code step', async () => {
      const spy = jest.spyOn(global, 'setInterval');
      try {
        const r = await rig();
        await toCode(r, []);
        expect(screen.getByLabelText(t('addTv.codeTitle'))).toBeTruthy();
        expect(spy.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    });

    it('Show a new code starts pairing again', async () => {
      const r = await rig();
      const asks: (string | null)[] = [];
      await toCode(r, asks);
      r.setup.pair.mockImplementationOnce(hang);
      await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'abc');
      await fireEvent.press(screen.getByLabelText(t('addTv.codeNew')));
      await waitFor(() => expect(r.setup.pair).toHaveBeenCalledTimes(2));
      expect(screen.getByLabelText(t('addTv.codeTitle')).props.value).toBe('');
      expect(asks).toEqual([null]);
      expect(screen.queryByText(t('addTv.unreachable'))).toBeNull();
    });
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

  it('finds a duplicate by MAC across brands', async () => {
    const r = await rig();
    await r.s.store.upsertDevice({
      id: 'old',
      kind: 'tv',
      name: 'Sony',
      roomId: 'r1',
      order: 0,
      links: [
        {
          kind: 'androidtv',
          host: '192.168.1.50',
          mac: 'AA:BB:CC:DD:EE:FF',
          certRef: 'phone',
          pinSha256: 'p',
        },
      ],
    });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByText(t('addTv.duplicate', { name: 'Sony' }))).toBeTruthy();
    expect(await r.s.store.devices()).toHaveLength(1);
  });

  it('deletes the key of a pairing that finishes after the step was left', async () => {
    const r = await rig();
    let finish: (p: PairedTv) => void = () => undefined;
    r.setup.pair.mockImplementationOnce(() => new Promise<PairedTv>((res) => (finish = res)));
    r.setup.pair.mockImplementationOnce(hang);
    await r.s.secrets.set('key-new', 'secret');
    await r.s.secrets.set('key-new:usn', 'u1');
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    await fireEvent.press(screen.getByLabelText(t('addTv.promptMissing')));
    await act(async () => finish(paired()));
    await waitFor(async () => expect(await r.s.secrets.get('key-new')).toBeNull());
    expect(await r.s.secrets.get('key-new:usn')).toBeNull();
    expect(screen.queryByDisplayValue('LG OLED C4')).toBeNull();
  });
});
