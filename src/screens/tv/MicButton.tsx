import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Command } from '@/core';
import { DeviceError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Column, Touchable, Txt } from '@/ui';

const SAMPLE_RATE = 8000;

export interface MicButtonProps {
  deviceId: string;
  /** The TV takes phone audio over its link. */
  voice: boolean;
  /** The TV has a text field the phone can type into. */
  text: boolean;
  /** The screen is in front and the app is in the foreground; the hold ends when this goes false. */
  watching: boolean;
  send: (cmd: Command) => Promise<void>;
  /** A plain error line, or null to clear it. */
  onProblem: (line: string | null) => void;
  /** The line for a failed send (the screen's usual one). */
  errorLine: (e: unknown) => string;
  onPress?: () => void;
}

/** Dictation names its refusal error (screens may not import the voice module). */
function isDenied(e: unknown): boolean {
  return e instanceof Error && e.name === 'DictationDeniedError';
}

/** One hold: `stop` ends whatever it started; `released` is set when the finger comes up. */
interface Hold {
  released: boolean;
  /** Ended by focus loss, the background or unmount: the result is dropped, not sent. */
  cancelled: boolean;
  /** The start (permission, session, mic) has finished, one way or another. */
  settled: boolean;
  stop?: () => void;
}

/** The hold-to-talk mic: native voice when the TV takes it, else on-device dictation, else nothing. */
export function MicButton(props: MicButtonProps): ReactElement | null {
  const { deviceId, voice, text, watching, send, onProblem, errorLine } = props;
  const { hub, voice: engines } = useServices();
  const [dictation, setDictation] = useState(false);
  const [listening, setListening] = useState(false);
  const hold = useRef<Hold | null>(null);
  const latest = useRef<Hold | null>(null);

  // Once per focus: can this phone turn speech into text without the network?
  useEffect(() => {
    if (!watching) return;
    let current = true;
    engines.dictation.available().then(
      (ok) => current && setDictation(ok),
      () => current && setDictation(false),
    );
    return () => {
      current = false;
    };
  }, [watching, engines.dictation]);

  const release = useCallback((cancel = false): void => {
    const h = hold.current;
    if (!h) return;
    hold.current = null;
    h.released = true;
    h.cancelled = cancel;
    setListening(false);
    h.stop?.();
  }, []);

  // Losing focus, the background, or unmount ends the hold.
  useEffect(() => {
    if (!watching) release(true);
  }, [watching, release]);
  useEffect(() => () => release(true), [release]);

  const dictate = (h: Hold): void => {
    const run = engines.dictation.start();
    h.stop = () => {
      run.stop().then(
        (spoken) => {
          if (spoken === '' || h.cancelled) return;
          send({ kind: 'tv.text', text: spoken }).then(
            () => onProblem(null),
            (e: unknown) =>
              onProblem(
                e instanceof DeviceError && e.detail === 'noTextField'
                  ? t('tv.voiceNoField')
                  : errorLine(e),
              ),
          );
        },
        (e: unknown) => {
          if (h.cancelled) return;
          onProblem(isDenied(e) ? t('tv.micDenied') : t('tv.errNotSent'));
        },
      );
    };
  };

  const talk = async (h: Hold): Promise<void> => {
    if (voice) {
      let session;
      try {
        session = await hub.startVoice(deviceId);
      } catch (e) {
        if (!(dictation && text)) {
          onProblem(errorLine(e));
          if (hold.current === h) release();
          return;
        }
        // The TV would not start a voice session: dictate for this hold.
        if (!h.released) dictate(h);
        return;
      }
      if (h.released) {
        session.end();
        return;
      }
      try {
        const live = session;
        let capture: { stop(): void } | undefined;
        let failed = false;
        h.stop = () => {
          capture?.stop();
          live.end();
        };
        capture = engines.mic.start(SAMPLE_RATE, (chunk) => {
          try {
            live.push(chunk);
          } catch (e) {
            // The session is gone (the TV disconnected): stop listening.
            onProblem(errorLine(e));
            failed = true;
            if (hold.current === h) release();
          }
        });
        // A chunk that arrived before `start` returned could not stop what did not exist yet.
        if (failed) capture.stop();
      } catch (e) {
        h.stop = undefined;
        session.end();
        onProblem(errorLine(e));
        if (hold.current === h) release();
      }
      return;
    }
    dictate(h);
  };

  const down = (): void => {
    // A previous hold may still be starting: ignore the press until it settles.
    if (hold.current || (latest.current && !latest.current.settled)) return;
    const h: Hold = { released: false, cancelled: false, settled: false };
    hold.current = h;
    latest.current = h;
    setListening(true);
    onProblem(null);
    engines.mic.requestPermission().then(
      (granted) => {
        if (h.released) {
          h.settled = true;
          return;
        }
        if (!granted) {
          h.settled = true;
          onProblem(t('tv.micDenied'));
          release();
          return;
        }
        talk(h)
          .catch((e: unknown) => {
            onProblem(errorLine(e));
            if (hold.current === h) release();
          })
          .finally(() => {
            h.settled = true;
          });
      },
      () => {
        h.settled = true;
        onProblem(t('tv.micDenied'));
        release();
      },
    );
  };

  if (!voice && !(text && dictation)) return null;

  return (
    <Column gap={1} align="center">
      <Touchable
        onPress={props.onPress ?? (() => undefined)}
        onPressIn={down}
        onPressOut={() => release()}
        accessibilityLabel={t('tv.voice')}
      >
        <Box bg="accent" border="line" radius="pill" px={6} py={5} align="center" justify="center">
          <Txt variant="heading" color="accentInk">
            🎙
          </Txt>
        </Box>
      </Touchable>
      {listening ? (
        <Txt variant="caption" color="ink2" live>
          {t('tv.listening')}
        </Txt>
      ) : null}
    </Column>
  );
}
