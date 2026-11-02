import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface Dictation {
  /** True only when this phone can recognise speech fully on the device, now. */
  available(): Promise<boolean>;
  /** Starts listening with requiresOnDeviceRecognition: true. `stop()` ends it and resolves with
   *  the final text ('' when nothing was heard). Rejects on a recognition error. */
  start(): { stop(): Promise<string> };
}

/** Speech or microphone permission was refused. */
export class DictationDeniedError extends Error {
  constructor() {
    super('Speech recognition permission was denied');
    this.name = 'DictationDeniedError';
  }
}

/** How long `stop()` waits for the recognizer's `end` event before aborting it. */
const STOP_TIMEOUT_MS = 3000;
const FALLBACK_LOCALE = 'en-US';

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

/**
 * The language to recognise, or null when no on-device model exists for it. Android needs the
 * device locale (or en-US) among the installed on-device locales; iOS asks the system.
 */
async function onDeviceLocale(): Promise<string | null> {
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return null;
  if (Platform.OS !== 'android') return FALLBACK_LOCALE;
  const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
  const wanted = deviceLocale();
  return [wanted, FALLBACK_LOCALE].find((l) => installedLocales.includes(l)) ?? null;
}

/** Speech to text on this phone only: every start requires on-device recognition. */
export function createNativeDictation(): Dictation {
  return {
    async available() {
      try {
        return (await onDeviceLocale()) !== null;
      } catch {
        return false;
      }
    },
    start() {
      let text = '';
      let failure: Error | undefined;
      let ended = false;
      let wake: (() => void) | undefined;
      const subs: { remove(): void }[] = [];
      const release = (): void => subs.forEach((s) => s.remove());
      const begin = (async (): Promise<void> => {
        for (const event of ['result', 'error', 'end'] as const) {
          subs.push(
            ExpoSpeechRecognitionModule.addListener(event, (e: unknown) => {
              if (event === 'result') {
                const r = e as { results: { transcript: string }[] };
                text = r.results[0]?.transcript ?? text;
              } else if (event === 'error') {
                const err = e as { error: string; message: string };
                // "aborted" is our own stop; "no-speech" is silence, not a failure.
                if (err.error !== 'aborted' && err.error !== 'no-speech') {
                  failure ??=
                    err.error === 'not-allowed'
                      ? new DictationDeniedError()
                      : new Error(err.message || err.error);
                }
              } else {
                ended = true;
                wake?.();
              }
            }),
          );
        }
        const lang = await onDeviceLocale();
        if (lang === null) throw new Error('No on-device speech recognition');
        const granted = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!granted.granted) throw new DictationDeniedError();
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          requiresOnDeviceRecognition: true,
        });
      })();
      begin.catch((e: unknown) => {
        failure ??= e instanceof Error ? e : new Error('Dictation did not start');
        ended = true;
        wake?.();
      });
      return {
        async stop() {
          try {
            await begin.catch(() => undefined);
            if (!ended) {
              ExpoSpeechRecognitionModule.stop();
              let timer: ReturnType<typeof setTimeout> | undefined;
              const timedOut = await Promise.race([
                new Promise<false>((resolve) => {
                  wake = () => resolve(false);
                  if (ended) resolve(false);
                }),
                new Promise<true>((resolve) => {
                  timer = setTimeout(() => resolve(true), STOP_TIMEOUT_MS);
                }),
              ]);
              clearTimeout(timer);
              if (timedOut) ExpoSpeechRecognitionModule.abort();
            }
          } finally {
            release();
          }
          if (failure) throw failure;
          return text.trim();
        },
      };
    },
  };
}
