import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Linking, Platform } from 'react-native';
import type { FoundTv, Link, PairedTv } from '@/core';
import { DeviceError, PairError } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { AddTvFlow } from '@/screens/add/tv/AddTvFlow';
import { SEARCH_MS } from '@/screens/add/tv/FindTvStep';
import { PairTvStep } from '@/screens/add/tv/PairTvStep';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { OtpCells, PairRing, Radar } from '@/ui/addtv';
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
const samsungBrand = {
  kind: 'samsung' as const,
  labelKey: 'addTv.brandSamsung',
  pairing: 'allow' as const,
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
    tvBrands: [webosBrand, androidtvBrand, samsungBrand],
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  return { s, setup, stopped: fake.stopped, found: (tv) => act(async () => fake.found(tv)) };
}

const hang = (): Promise<PairedTv> => new Promise(() => undefined);

const toFind = async (): Promise<void> => {
  await fireEvent.press(screen.getByLabelText(t('addTv.findMine')));
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

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

  it('picking a brand only selects it; Find my TV goes on', async () => {
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    expect(screen.getByLabelText(t('addTv.brandLg')).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText(t('addTv.brandAndroidTv')));
    expect(screen.getByLabelText(t('addTv.brandAndroidTv')).props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByLabelText(t('addTv.brandLg')).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText(t('addTv.findTitle'))).toBeNull();
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
    expect(screen.getByText(t('addTv.findBody'))).toBeTruthy();
    await r.found(atv);
    expect(screen.getByText(t('addTv.brandAndroidTv'))).toBeTruthy();
    expect(screen.getByText('192.168.1.20')).toBeTruthy();
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

  it('finds a duplicate by certificate pin when there is no MAC, and saves one device', async () => {
    const r = await rig();
    const link = {
      kind: 'androidtv' as const,
      host: '192.168.1.20',
      certRef: 'androidtv:identity',
      pinSha256: 'pin-1',
    };
    await r.s.store.upsertDevice({
      id: 'old',
      kind: 'tv',
      name: 'Sony',
      roomId: 'r1',
      order: 0,
      links: [{ ...link, host: '192.168.1.99' }],
    });
    r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
      await prompts.askCode(false);
      return { link, suggestedName: 'Sony' };
    });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(atv);
    await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
    await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b2c3');
    await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
    expect(await screen.findByText(t('addTv.duplicate', { name: 'Sony' }))).toBeTruthy();
    expect(await r.s.store.devices()).toHaveLength(1);
  });

  it('does not call two Android TVs with different pins duplicates', async () => {
    const r = await rig();
    const link = {
      kind: 'androidtv' as const,
      host: '192.168.1.20',
      certRef: 'androidtv:identity',
      pinSha256: 'pin-1',
    };
    await r.s.store.upsertDevice({
      id: 'old',
      kind: 'tv',
      name: 'Sony',
      roomId: 'r1',
      order: 0,
      links: [{ ...link, pinSha256: 'pin-2' }],
    });
    r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
      await prompts.askCode(false);
      return { link, suggestedName: 'Other' };
    });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(atv);
    await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
    await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b2c3');
    await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
    expect(await screen.findByDisplayValue('Other')).toBeTruthy();
  });

  it('shows the Android TV unreachable line when a code pairing cannot reach the TV', async () => {
    const r = await rig();
    r.setup.pair.mockImplementationOnce(() => Promise.reject(new PairError('unreachable')));
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(atv);
    await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
    expect(await screen.findByText(t('addTv.unreachableAndroidTv'))).toBeTruthy();
    expect(screen.queryByText(t('addTv.unreachable'))).toBeNull();
  });

  it('keeps the LG unreachable line for an LG pairing', async () => {
    const r = await rig();
    r.setup.pair.mockImplementationOnce(() => Promise.reject(new PairError('unreachable')));
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByText(t('addTv.unreachable'))).toBeTruthy();
  });

  it('deletes the key of a pairing that finishes after the step was left', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
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
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    await fireEvent.press(screen.getByLabelText(t('addTv.promptMissing')));
    await act(async () => finish(paired()));
    // Under fake timers waitFor is unreliable here: let the deletes settle by hand.
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(await r.s.secrets.get('key-new')).toBeNull();
    expect(await r.s.secrets.get('key-new:usn')).toBeNull();
    expect(screen.queryByDisplayValue('LG OLED C4')).toBeNull();
  });
});

describe('Add TV, as in the mock', () => {
  const searchEnds = async (): Promise<void> => {
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_MS);
    });
  };

  it('says Paired after a first pairing', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const r = await rig();
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(lg);
    await fireEvent.press(screen.getByLabelText('LG OLED C4, 192.168.1.23'));
    expect(await screen.findByText(t('addTv.pairedFirst'))).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(await screen.findByDisplayValue('LG OLED C4')).toBeTruthy();
  });

  it('says Paired again when pairing a TV that is already added', async () => {
    const r = await rig();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await renderWith(r.s, <PairTvStep tv={lg} again onPaired={jest.fn()} onBack={jest.fn()} />);
    expect(await screen.findByText(t('addTv.paired'))).toBeTruthy();
    expect(screen.queryByText(t('addTv.pairedFirst'))).toBeNull();
  });

  it('shows the prompt-missing link only after 15 seconds', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const r = await rig();
    r.setup.pair.mockImplementationOnce(hang);
    await renderWith(r.s, <PairTvStep tv={lg} onPaired={jest.fn()} onBack={jest.fn()} />);
    expect(screen.queryByLabelText(t('addTv.promptMissing'))).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(screen.getByLabelText(t('addTv.promptMissing'))).toBeTruthy();
  });

  it('shows the pairing ring with the seconds left', async () => {
    const r = await rig();
    await renderWith(r.s, <PairRing secondsLeft={42} total={60} phase="wait" />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByTestId('pair-ring-arc')).toBeTruthy();
  });

  describe('Radar', () => {
    it('pings three rings while searching', async () => {
      const r = await rig();
      await renderWith(r.s, <Radar searching />);
      expect(screen.getAllByTestId('radar-ping')).toHaveLength(3);
    });

    it('draws no rings at rest', async () => {
      const r = await rig();
      await renderWith(r.s, <Radar searching={false} />);
      expect(screen.queryAllByTestId('radar-ping')).toHaveLength(0);
      expect(screen.getByTestId('radar-core')).toBeTruthy();
    });

    it('draws no rings under reduced motion, and the core still shows', async () => {
      const r = await rig();
      await renderWith(r.s, <Radar searching />, { reducedMotion: true });
      expect(screen.queryAllByTestId('radar-ping')).toHaveLength(0);
      expect(screen.getByTestId('radar-core')).toBeTruthy();
    });

    it('stops the rings when reduced motion turns on while searching', async () => {
      const ui = (reduced: boolean) => (
        <ThemeProvider scheme="light" reducedMotion={reduced}>
          <Radar searching />
        </ThemeProvider>
      );
      const view = await render(ui(false));
      expect(screen.getAllByTestId('radar-ping')).toHaveLength(3);
      await view.rerender(ui(true));
      expect(screen.queryAllByTestId('radar-ping')).toHaveLength(0);
      expect(screen.getByTestId('radar-core')).toBeTruthy();
    });

    it('has an accent core in the dark theme', async () => {
      const r = await rig();
      await renderWith(r.s, <Radar searching />, { scheme: 'dark' });
      expect(screen.getByTestId('radar-core')).toHaveStyle({
        backgroundColor: darkTokens.color.accent,
      });
    });
  });

  describe('Local Network off', () => {
    const search = async (os: 'ios' | 'android'): Promise<Rig> => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.replaceProperty(Platform, 'OS', os);
      const r = await rig();
      await renderWith(r.s, <AddTvFlow />);
      await toFind();
      await searchEnds();
      return r;
    };

    it('explains it on iOS when a search ends with nothing, and opens Settings', async () => {
      const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
      await search('ios');
      expect(screen.getByText(t('addTv.localNetworkOff'))).toBeTruthy();
      await fireEvent.press(screen.getByLabelText(t('common.openSettings')));
      expect(open).toHaveBeenCalledTimes(1);
      expect(screen.getByText(t('addTv.sameWifi'))).toBeTruthy();
    });

    it('does not mention it on Android', async () => {
      await search('android');
      expect(screen.queryByText(t('addTv.localNetworkOff'))).toBeNull();
      expect(screen.queryByLabelText(t('common.openSettings'))).toBeNull();
      expect(screen.getByText(t('addTv.sameWifi'))).toBeTruthy();
    });

    it('does not mention it before the search ends, or when a TV answered', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.replaceProperty(Platform, 'OS', 'ios');
      const r = await rig();
      await renderWith(r.s, <AddTvFlow />);
      await toFind();
      expect(screen.queryByText(t('addTv.localNetworkOff'))).toBeNull();
      await r.found(lg);
      await searchEnds();
      expect(screen.queryByText(t('addTv.localNetworkOff'))).toBeNull();
    });
  });

  describe('Code cells', () => {
    it('shows the typed characters upper-cased and keeps the label on the one input', async () => {
      const r = await rig();
      const onChange = jest.fn();
      await renderWith(
        r.s,
        <OtpCells
          value="a1b"
          length={6}
          invalid={false}
          onChange={onChange}
          accessibilityLabel={t('addTv.codeTitle')}
        />,
      );
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b2');
      expect(onChange).toHaveBeenCalledWith('a1b2');
      expect(screen.getByTestId('otp-cell-3')).toHaveStyle({
        backgroundColor: lightTokens.color.accent,
      });
      expect(screen.getByTestId('otp-cell-0')).toHaveStyle({
        backgroundColor: lightTokens.color.line,
      });
    });

    it('rings the cells in danger when the code is wrong', async () => {
      const r = await rig();
      await renderWith(
        r.s,
        <OtpCells
          value="abcdef"
          length={6}
          invalid
          onChange={jest.fn()}
          accessibilityLabel={t('addTv.codeTitle')}
        />,
      );
      expect(screen.getByTestId('otp-cell-0')).toHaveStyle({
        backgroundColor: lightTokens.color.danger,
      });
    });

    it('shows the wrong-code line and cells on the flow', async () => {
      const r = await rig();
      r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
        await prompts.askCode(false);
        await prompts.askCode(true);
        return paired();
      });
      await renderWith(r.s, <AddTvFlow />);
      await toFind();
      await r.found(atv);
      await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
      await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'zzzzzz');
      await fireEvent.press(screen.getByLabelText(t('addTv.codePair')));
      expect(await screen.findByText(t('addTv.codeWrong'))).toBeTruthy();
      expect(screen.getByTestId('otp-cell-0')).toHaveStyle({
        backgroundColor: lightTokens.color.danger,
      });
    });
  });
});

describe('Add TV, Samsung and the success hold', () => {
  const samsung: FoundTv = {
    kind: 'samsung',
    host: '192.168.1.41',
    name: 'Samsung Crystal',
    secure: true,
  };
  const samsungPaired: PairedTv = {
    link: {
      kind: 'samsung',
      host: samsung.host,
      tokenRef: 'samsung-token',
      pinSha256: 'pin-s',
    },
    suggestedName: 'Samsung Crystal',
  };
  const fake = (): void => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  };
  /** Mounts the step and hands back a way to leave it (unmount it) like Back does. */
  function Gate(props: {
    children: ReactElement;
    leave: { current: () => void };
  }): ReactElement | null {
    const [open, setOpen] = useState(true);
    props.leave.current = () => setOpen(false);
    return open ? props.children : null;
  }
  const flush = (): Promise<void> =>
    act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });

  it('lists the three brands, finds a Samsung and pairs it with the Allow ring', async () => {
    fake();
    const r = await rig();
    r.setup.pair.mockResolvedValueOnce(samsungPaired);
    await renderWith(r.s, <AddTvFlow />);
    expect(screen.getByLabelText(t('addTv.brandLg'))).toBeTruthy();
    expect(screen.getByLabelText(t('addTv.brandAndroidTv'))).toBeTruthy();
    expect(screen.getByLabelText(t('addTv.brandSamsung'))).toBeTruthy();
    await toFind();
    await r.found(samsung);
    expect(screen.getByText(t('addTv.brandSamsung'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Samsung Crystal, 192.168.1.41'));
    expect(await screen.findByText(t('addTv.pairedFirst'))).toBeTruthy();
    expect(screen.getByTestId('pair-ring')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(await screen.findByDisplayValue('Samsung Crystal')).toBeTruthy();
  });

  it('delivers the result once, after the hold', async () => {
    fake();
    const r = await rig();
    const onPaired = jest.fn();
    await renderWith(r.s, <PairTvStep tv={lg} onPaired={onPaired} onBack={jest.fn()} />);
    await flush();
    expect(onPaired).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(599);
    });
    expect(onPaired).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(onPaired).toHaveBeenCalledTimes(1);
    expect(onPaired).toHaveBeenCalledWith(paired());
  });

  it('deletes the key when the step is left during the hold', async () => {
    fake();
    const r = await rig();
    await r.s.secrets.set('key-new', 'secret');
    await r.s.secrets.set('key-new:usn', 'u1');
    const onPaired = jest.fn();
    const leave = { current: () => undefined };
    await renderWith(
      r.s,
      <Gate leave={leave}>
        <PairTvStep tv={lg} onPaired={onPaired} onBack={jest.fn()} />
      </Gate>,
    );
    await flush();
    await act(async () => leave.current());
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await flush();
    expect(onPaired).not.toHaveBeenCalled();
    expect(await r.s.secrets.get('key-new')).toBeNull();
    expect(await r.s.secrets.get('key-new:usn')).toBeNull();
  });

  it('deletes a Samsung token when the step is left during the hold', async () => {
    fake();
    const r = await rig();
    r.setup.pair.mockResolvedValueOnce(samsungPaired);
    await r.s.secrets.set('samsung-token', 'tok');
    const leave = { current: () => undefined };
    await renderWith(
      r.s,
      <Gate leave={leave}>
        <PairTvStep tv={samsung} onPaired={jest.fn()} onBack={jest.fn()} />
      </Gate>,
    );
    await flush();
    await act(async () => leave.current());
    await flush();
    expect(await r.s.secrets.get('samsung-token')).toBeNull();
  });

  it('keeps Pair disabled until the code is full', async () => {
    const r = await rig();
    r.setup.pair.mockImplementationOnce(async (_tv, prompts) => {
      await prompts.askCode(false);
      return paired();
    });
    await renderWith(r.s, <AddTvFlow />);
    await toFind();
    await r.found(atv);
    await fireEvent.press(screen.getByLabelText('Sony, 192.168.1.20'));
    await screen.findByLabelText(t('addTv.codeTitle'));
    await waitFor(() => expect(screen.getByLabelText(t('addTv.codePair'))).toBeEnabled()).catch(
      () => undefined,
    );
    const pair = (): ReturnType<typeof screen.getByLabelText> =>
      screen.getByLabelText(t('addTv.codePair'));
    await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b');
    expect(pair().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(t('addTv.codeTitle')), 'a1b2c3');
    expect(pair().props.accessibilityState.disabled).toBe(false);
  });
});
