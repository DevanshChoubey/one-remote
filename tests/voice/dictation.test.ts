import { Platform } from 'react-native';
import { createNativeDictation, DictationDeniedError } from '@/voice/dictation';

type Listener = (e: unknown) => void;
const listeners = new Map<string, Listener>();
const mockModule = {
  supportsOnDeviceRecognition: jest.fn<boolean, []>(),
  getSupportedLocales: jest.fn<
    Promise<{ locales: string[]; installedLocales: string[] }>,
    [object]
  >(),
  requestPermissionsAsync: jest.fn<Promise<{ granted: boolean }>, []>(),
  start: jest.fn<void, [Record<string, unknown>]>(),
  stop: jest.fn<void, []>(),
  abort: jest.fn<void, []>(),
  addListener: jest.fn((event: string, cb: Listener) => {
    listeners.set(event, cb);
    return { remove: () => listeners.delete(event) };
  }),
};
// A getter: the import of the code under test runs before `mockModule` is initialised.
jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockModule;
  },
}));

const emit = (event: string, payload: unknown = null): void => listeners.get(event)?.(payload);
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  listeners.clear();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  mockModule.supportsOnDeviceRecognition.mockReset().mockReturnValue(true);
  mockModule.getSupportedLocales
    .mockReset()
    .mockResolvedValue({ locales: ['en-US'], installedLocales: ['en-US'] });
  mockModule.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockModule.start.mockReset();
  mockModule.abort.mockReset();
  mockModule.stop.mockReset().mockImplementation(() => emit('end'));
});

describe('available', () => {
  it('is true with on-device support and an installed locale', async () => {
    await expect(createNativeDictation().available()).resolves.toBe(true);
  });

  it('is false without on-device support, however many locales exist', async () => {
    mockModule.supportsOnDeviceRecognition.mockReturnValue(false);
    await expect(createNativeDictation().available()).resolves.toBe(false);
  });

  it('is false on Android when no usable locale is installed', async () => {
    mockModule.getSupportedLocales.mockResolvedValue({
      locales: ['en-US'],
      installedLocales: [],
    });
    await expect(createNativeDictation().available()).resolves.toBe(false);
  });

  it('is true on iOS from the system check alone', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    await expect(createNativeDictation().available()).resolves.toBe(true);
    expect(mockModule.getSupportedLocales).not.toHaveBeenCalled();
  });

  it('is false on any error', async () => {
    mockModule.getSupportedLocales.mockRejectedValue(new Error('package_not_found'));
    await expect(createNativeDictation().available()).resolves.toBe(false);
  });
});

describe('start', () => {
  it('always requires on-device recognition, and resolves with the last text', async () => {
    const run = createNativeDictation().start();
    await flush();
    expect(mockModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true }),
    );
    emit('result', { isFinal: false, results: [{ transcript: 'net' }] });
    emit('result', { isFinal: true, results: [{ transcript: ' netflix ' }] });
    await expect(run.stop()).resolves.toBe('netflix');
    expect(listeners.size).toBe(0);
  });

  it('aborts after 3000 ms when the end event never comes, keeping the text heard', async () => {
    jest.useFakeTimers();
    try {
      mockModule.stop.mockImplementation(() => undefined);
      const run = createNativeDictation().start();
      await flush();
      emit('result', { isFinal: false, results: [{ transcript: 'hello' }] });
      const done = jest.fn();
      const p = run.stop().then(done);
      await flush();
      jest.advanceTimersByTime(2999);
      await flush();
      expect(done).not.toHaveBeenCalled();
      expect(mockModule.abort).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await p;
      expect(done).toHaveBeenCalledWith('hello');
      expect(mockModule.abort).toHaveBeenCalledTimes(1);
      expect(listeners.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves with empty text when nothing was heard', async () => {
    const run = createNativeDictation().start();
    await flush();
    emit('error', { error: 'no-speech', message: 'none' });
    await expect(run.stop()).resolves.toBe('');
  });

  it('rejects on a recognition error', async () => {
    const run = createNativeDictation().start();
    await flush();
    emit('error', { error: 'audio-capture', message: 'broken' });
    await expect(run.stop()).rejects.toThrow('broken');
  });

  it('rejects with the denied error when permission is refused, and never starts', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const run = createNativeDictation().start();
    await expect(run.stop()).rejects.toBeInstanceOf(DictationDeniedError);
    expect(mockModule.start).not.toHaveBeenCalled();
  });

  it('rejects, and never starts, when no on-device locale exists', async () => {
    mockModule.supportsOnDeviceRecognition.mockReturnValue(false);
    const run = createNativeDictation().start();
    await expect(run.stop()).rejects.toThrow();
    expect(mockModule.start).not.toHaveBeenCalled();
  });
});
