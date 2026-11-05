import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import type { Capabilities, Device, VoiceSession } from '@/core';
import { DeviceError } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import type { FakeDriver } from '@/device/testing/fakeDriver';
import { t } from '@/i18n';
import { TvScreen } from '@/screens/tv/TvScreen';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { DictationDeniedError } from '@/voice/dictation';
import { createFakeDictation } from '@/voice/testing/fakeDictation';
import type { FakeDictation } from '@/voice/testing/fakeDictation';
import { createFakeMic } from '@/voice/testing/fakeMic';
import type { FakeMic } from '@/voice/testing/fakeMic';
import { ThemeProvider } from '@/theme';
import { ToastProvider } from '@/ui';
import { renderWith, room } from '../helpers';

/** Runs the cleanup of every focus effect, as leaving the screen does. */
const mockBlurs: (() => void)[] = [];

jest.mock('react-native-udp');
jest.mock('@/screens/tv/useVolumeKeys', () => ({ useVolumeKeys: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI' },
  useNetworkState: () => ({ type: 'WIFI' }),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) =>
      useEffect(() => {
        const cleanup = cb();
        mockBlurs.push(() => cleanup?.());
        return cleanup;
      }, [cb]),
  };
});

const tvDevice: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'TV tv1',
  roomId: 'r1',
  order: 0,
  links: [
    {
      kind: 'androidtv',
      host: '192.168.1.23',
      certRef: 'androidtv:identity',
      pinSha256: 'pin',
    },
  ],
};

interface FakeSession extends VoiceSession {
  pushed: Uint8Array[];
  ended: number;
  gone: boolean;
}

function fakeSession(): FakeSession {
  const s: FakeSession = {
    pushed: [],
    ended: 0,
    gone: false,
    push(pcm) {
      if (s.gone) throw new DeviceError('notSent');
      s.pushed.push(pcm);
    },
    end() {
      s.ended += 1;
    },
  };
  return s;
}

interface Rig {
  s: Services;
  driver: FakeDriver;
  mic: FakeMic;
  dictation: FakeDictation;
  session: FakeSession;
  /** Resolves the pending startVoice; or rejects it. */
  begin: () => void;
  refuse: (e: Error) => void;
  startVoice: jest.Mock;
}

async function rig(
  tvCaps: { voice: boolean; text?: boolean },
  opts: { dictation?: boolean; deferred?: boolean } = {},
): Promise<Rig> {
  const session = fakeSession();
  let begin = (): void => undefined;
  let refuse: (e: Error) => void = () => undefined;
  const startVoice = jest.fn(() =>
    opts.deferred
      ? new Promise<VoiceSession>((resolve, reject) => {
          begin = () => resolve(session);
          refuse = reject;
        })
      : Promise.resolve<VoiceSession>(session),
  );
  const capabilities: Capabilities = {
    tv: { inputList: true, text: tvCaps.text ?? true, powerOn: true, voice: tvCaps.voice },
  };
  const driver = createFakeDriver('androidtv', { capabilities, startVoice });
  const mic = createFakeMic();
  const dictation = createFakeDictation(opts.dictation ?? false);
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [driver],
    tv: {
      discover: () => () => undefined,
      probeHost: () => Promise.resolve(null),
      pair: () => Promise.reject(new Error('unused')),
      findAgain: () => Promise.resolve(null),
    },
    voice: { mic, dictation },
  });
  await s.store.upsertRoom(room('r1', 'Living room', 0));
  await s.store.upsertDevice(tvDevice);
  await act(async () => {
    await Promise.resolve();
  });
  return {
    s,
    driver,
    mic,
    dictation,
    session,
    begin: () => begin(),
    refuse: (e) => refuse(e),
    startVoice,
  };
}

const settle = (): Promise<void> =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

const mic = (): ReturnType<typeof screen.getByLabelText> => screen.getByLabelText(t('tv.voice'));
const hold = async (): Promise<void> => {
  await fireEvent(mic(), 'pressIn');
  await settle();
};
const letGo = async (): Promise<void> => {
  await fireEvent(mic(), 'pressOut');
  await settle();
};
/** The TV screen with the TV on: the mic and its lines live in the ready remote (while connecting
 *  the keys are faded and take no touches). */
const showing = async (r: Rig): Promise<void> => {
  await renderWith(r.s, <TvScreen deviceId="tv1" />);
  await act(async () => {
    r.driver.emit('tv1', { kind: 'tv', state: { power: true } });
  });
  await settle();
};

beforeEach(() => {
  mockBlurs.length = 0;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});
afterEach(() => jest.restoreAllMocks());

describe('MicButton: native voice', () => {
  it('streams mic chunks to the session while held, and ends on release', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    await hold();
    expect(r.startVoice).toHaveBeenCalled();
    expect(r.mic.starts).toEqual([8000]);
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
    r.mic.emit(new Uint8Array([1, 2]));
    expect(r.session.pushed).toEqual([new Uint8Array([1, 2])]);
    await letGo();
    expect(r.mic.stops).toBe(1);
    expect(r.session.ended).toBe(1);
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('a release before the session starts ends it at once, with no mic left open', async () => {
    const r = await rig({ voice: true }, { deferred: true });
    await showing(r);
    await hold();
    await letGo();
    r.begin();
    await settle();
    expect(r.session.ended).toBe(1);
    expect(r.mic.starts).toEqual([]);
    expect(r.mic.active).toBe(false);
  });

  it('a release before the permission answers starts nothing', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    let answer: (granted: boolean) => void = () => undefined;
    r.mic.requestPermission = () => new Promise<boolean>((resolve) => (answer = resolve));
    await showing(r);
    await fireEvent(mic(), 'pressIn');
    await fireEvent(mic(), 'pressOut');
    answer(true);
    await settle();
    expect(r.startVoice).not.toHaveBeenCalled();
    expect(r.mic.active).toBe(false);
  });

  it('losing focus mid-hold stops the mic and ends the session', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    await hold();
    expect(r.mic.active).toBe(true);
    await act(async () => {
      // The app goes to the background.
      Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
      const listeners = jest
        .mocked(AppState.addEventListener)
        .mock.calls.filter(([type]) => type === 'change');
      expect(listeners.length).toBeGreaterThan(0);
      listeners.forEach(([, cb]) => cb('background'));
    });
    await settle();
    expect(r.mic.active).toBe(false);
    expect(r.session.ended).toBe(1);
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('unmounting mid-hold stops the mic and ends the session', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    await hold();
    await screen.unmount();
    expect(r.mic.active).toBe(false);
    expect(r.session.ended).toBe(1);
  });

  it('a chunk that arrives inside mic.start and fails still stops the capture', async () => {
    const r = await rig({ voice: true });
    r.session.gone = true;
    let stopped = 0;
    r.mic.start = (_rate, cb) => {
      cb(new Uint8Array([1]));
      return {
        stop: () => {
          stopped += 1;
        },
      };
    };
    await showing(r);
    await hold();
    expect(stopped).toBe(1);
    expect(r.session.ended).toBe(1);
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('a new press while the previous start is unsettled is ignored', async () => {
    const r = await rig({ voice: true }, { deferred: true });
    await showing(r);
    await hold();
    await letGo();
    await hold();
    expect(r.startVoice).toHaveBeenCalledTimes(1);
    r.begin();
    await settle();
    expect(r.startVoice).toHaveBeenCalledTimes(1);
    expect(r.session.ended).toBe(1);
    expect(screen.queryByText(t('tv.errNotSent'))).toBeNull();
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('a double press starts one session', async () => {
    const r = await rig({ voice: true }, { deferred: true });
    await showing(r);
    await hold();
    await hold();
    expect(r.startVoice).toHaveBeenCalledTimes(1);
  });

  it('a TV that drops mid-hold stops the mic and shows one error line', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    await hold();
    r.session.gone = true;
    await act(async () => {
      r.mic.emit(new Uint8Array([1]));
    });
    await settle();
    expect(r.mic.active).toBe(false);
    expect(r.session.ended).toBe(1);
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('a denied microphone shows one plain line and keeps the button', async () => {
    const r = await rig({ voice: true });
    r.mic.denyPermission();
    await showing(r);
    await hold();
    expect(screen.getByText(t('tv.micDenied'))).toBeTruthy();
    expect(r.startVoice).not.toHaveBeenCalled();
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
    expect(mic()).toBeTruthy();
  });

  it('a TV that will not start voice, with no dictation, shows the usual error', async () => {
    const r = await rig({ voice: true });
    r.startVoice.mockRejectedValueOnce(new DeviceError('notSent'));
    await showing(r);
    await hold();
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
    expect(r.mic.active).toBe(false);
    expect(screen.queryByText(t('tv.listening'))).toBeNull();
  });

  it('falls back to dictation for the hold when startVoice rejects', async () => {
    const r = await rig({ voice: true }, { dictation: true });
    r.startVoice.mockRejectedValueOnce(new DeviceError('notSent'));
    r.dictation.text = 'hello';
    await showing(r);
    await hold();
    expect(r.dictation.starts).toBe(1);
    expect(r.mic.starts).toEqual([]);
    await letGo();
    expect(r.driver.sent.map((x) => x.cmd)).toEqual([{ kind: 'tv.text', text: 'hello' }]);
  });

  it('a mic that will not start ends the session and shows an error', async () => {
    const r = await rig({ voice: true });
    r.mic.failNextStart();
    await showing(r);
    await hold();
    expect(r.session.ended).toBe(1);
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
  });
});

describe('MicButton: dictation', () => {
  it('sends the spoken text as tv.text', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.text = 'netflix';
    await showing(r);
    await hold();
    expect(r.startVoice).not.toHaveBeenCalled();
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
    await letGo();
    expect(r.dictation.stops).toBe(1);
    expect(r.driver.sent.map((x) => x.cmd)).toEqual([{ kind: 'tv.text', text: 'netflix' }]);
  });

  it('empty text sends nothing and shows nothing', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    await showing(r);
    await hold();
    await letGo();
    expect(r.driver.sent).toEqual([]);
    expect(screen.queryByText(t('tv.errNotSent'))).toBeNull();
    expect(screen.queryByText(t('tv.voiceNoField'))).toBeNull();
  });

  it('shows "open a search box" when the TV has no text field open', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.text = 'hi';
    r.driver.send = () =>
      Promise.reject(new DeviceError('notSent', 'No field here', 'noTextField'));
    await showing(r);
    await hold();
    await letGo();
    expect(screen.getByText(t('tv.voiceNoField'))).toBeTruthy();
  });

  it('a plain notSent error does not claim there is no text field', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.text = 'hi';
    r.driver.send = () => Promise.reject(new DeviceError('notSent', 'No text field is open'));
    await showing(r);
    await hold();
    await letGo();
    expect(screen.queryByText(t('tv.voiceNoField'))).toBeNull();
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
  });

  it('other send errors use the usual error line', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.text = 'hi';
    r.driver.failNext('timeout');
    await showing(r);
    await hold();
    await letGo();
    expect(screen.getByText(t('tv.errTimeout'))).toBeTruthy();
  });

  it('a recognition error shows one error line', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.failWith(new Error('boom'));
    await showing(r);
    await hold();
    await letGo();
    expect(screen.getByText(t('tv.errNotSent'))).toBeTruthy();
  });

  it('denied speech permission shows the microphone line', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.failWith(new DictationDeniedError());
    await showing(r);
    await hold();
    await letGo();
    expect(screen.getByText(t('tv.micDenied'))).toBeTruthy();
  });

  it('blurring mid-hold drops the dictated text', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    r.dictation.text = 'netflix';
    await showing(r);
    await hold();
    await act(async () => {
      mockBlurs.forEach((b) => b());
    });
    await settle();
    expect(r.dictation.stops).toBe(1);
    expect(r.driver.sent).toEqual([]);
  });

  it('unmounting mid-hold stops listening', async () => {
    const r = await rig({ voice: false }, { dictation: true });
    await showing(r);
    await hold();
    await screen.unmount();
    expect(r.dictation.active).toBe(false);
  });
});

describe('MicButton: the slot', () => {
  it('is empty when neither path is available', async () => {
    const r = await rig({ voice: false });
    await showing(r);
    expect(screen.queryByLabelText(t('tv.voice'))).toBeNull();
  });

  it('is empty when the TV has no text field, even with dictation', async () => {
    const r = await rig({ voice: false, text: false }, { dictation: true });
    await showing(r);
    expect(screen.queryByLabelText(t('tv.voice'))).toBeNull();
  });

  it('shows for native voice without dictation', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    expect(mic()).toBeTruthy();
  });
});

describe('MicButton: look', () => {
  const pulses = (): number => screen.queryAllByTestId('mic-pulse').length;
  const tree = (r: Rig, reducedMotion: boolean): ReturnType<typeof ThemeProvider> => (
    <ThemeProvider scheme="light" reducedMotion={reducedMotion}>
      <ServicesProvider services={r.s}>
        <ToastProvider>
          <TvScreen deviceId="tv1" />
        </ToastProvider>
      </ServicesProvider>
    </ThemeProvider>
  );

  it('pulses two rings while held and shows the bubble', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    expect(pulses()).toBe(0);
    await hold();
    expect(pulses()).toBe(2);
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
    await letGo();
    expect(pulses()).toBe(0);
  });

  it('stops the rings at once when reduced motion is switched on mid-hold, and keeps the bubble', async () => {
    const r = await rig({ voice: true });
    await showing(r);
    await hold();
    expect(pulses()).toBe(2);
    await act(async () => {
      screen.rerender(tree(r, true));
    });
    await settle();
    expect(screen.queryAllByTestId('mic-pulse')).toEqual([]);
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
    expect(mic()).toBeTruthy();
  });

  it('shows no rings under reduced motion from the start', async () => {
    const r = await rig({ voice: true });
    await renderWith(r.s, <TvScreen deviceId="tv1" />, { reducedMotion: true });
    await settle();
    await hold();
    expect(pulses()).toBe(0);
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
  });

  it('draws the mic accent while held (dark theme too)', async () => {
    const r = await rig({ voice: true });
    await renderWith(r.s, <TvScreen deviceId="tv1" />, { scheme: 'dark' });
    await settle();
    await hold();
    expect(screen.getByLabelText(t('tv.voice'))).toBeTruthy();
    expect(screen.getByText(t('tv.listening'))).toBeTruthy();
  });
});
