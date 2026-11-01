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
  stop?: () => void;
}

/** The hold-to-talk mic: native voice when the TV takes it, else on-device dictation, else nothing. */
export function MicButton(props: MicButtonProps): ReactElement | null {
  const { deviceId, voice, text, watching, send, onProblem, errorLine } = props;
  const { hub, voice: engines } = useServices();
  const [dictation, setDictation] = useState(false);
  const [listening, setListening] = useState(false);
  const hold = useRef<Hold | null>(null);

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

  const release = useCallback((): void => {
    const h = hold.current;
    if (!h) return;
    hold.current = null;
    h.released = true;
    setListening(false);
    h.stop?.();
  }, []);

  // Losing focus, the background, or unmount ends the hold.
  useEffect(() => {
    if (!watching) release();
  }, [watching, release]);
  useEffect(() => release, [release]);

  const dictate = (h: Hold): void => {
    const run = engines.dictation.start();
    h.stop = () => {
      run.stop().then(
        (spoken) => {
          if (spoken === '') return;
          send({ kind: 'tv.text', text: spoken }).then(
            () => onProblem(null),
            (e: unknown) =>
              onProblem(
                e instanceof DeviceError && e.code === 'notSent' && /text field/i.test(e.message)
                  ? t('tv.voiceNoField')
                  : errorLine(e),
              ),
          );
        },
        (e: unknown) => onProblem(isDenied(e) ? t('tv.micDenied') : t('tv.errNotSent')),
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
        const capture = engines.mic.start(SAMPLE_RATE, (chunk) => {
          try {
            live.push(chunk);
          } catch (e) {
            // The session is gone (the TV disconnected): stop listening.
            onProblem(errorLine(e));
            if (hold.current === h) release();
          }
        });
        h.stop = () => {
          capture.stop();
          live.end();
        };
      } catch (e) {
        session.end();
        onProblem(errorLine(e));
        if (hold.current === h) release();
      }
      return;
    }
    dictate(h);
  };

  const down = (): void => {
    if (hold.current) return;
    const h: Hold = { released: false };
    hold.current = h;
    setListening(true);
    onProblem(null);
    engines.mic.requestPermission().then(
      (granted) => {
        if (h.released) return;
        if (!granted) {
          onProblem(t('tv.micDenied'));
          release();
          return;
        }
        talk(h).catch((e: unknown) => {
          onProblem(errorLine(e));
          if (hold.current === h) release();
        });
      },
      () => {
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
        onPressOut={release}
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
