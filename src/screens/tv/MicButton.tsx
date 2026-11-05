import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import type { Command } from '@/core';
import { DeviceError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { useMotion } from '@/theme';
import { AnimatedBox, Box, Icon, Touchable, Txt } from '@/ui';
import { Equaliser, PulseRings, SentRing } from '@/ui/tv';

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
  /** A voice or dictation message has left the phone (the screen shows "Sent to the TV"). */
  onSent?: () => void;
  /** The hold starts or ends (the screen dims its pads while it is on). */
  onListening?: (listening: boolean) => void;
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
  const { deviceId, voice, text, watching, send, onProblem, errorLine, onListening } = props;
  const motion = useMotion();
  const [sentCount, setSentCount] = useState(0);
  const onSent = (): void => {
    setSentCount((n) => n + 1);
    props.onSent?.();
  };
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
            () => {
              onProblem(null);
              onSent();
            },
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
          if (!h.cancelled) onSent();
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

  // Listening grows the mic with a spring; reduced motion keeps it at rest, at once.
  const scale = useSharedValue(1);
  const grown = listening && !motion.reduced;
  useEffect(() => {
    if (grown) {
      scale.value = withTiming(1.12, motion.timing('fast', 'spring'));
    } else {
      cancelAnimation(scale);
      scale.value = 1;
    }
  }, [grown, scale, motion]);
  const micScale = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    onListening?.(listening);
  }, [listening, onListening]);

  if (!voice && !(text && dictation)) return null;

  return (
    <Box w={64} h={64} align="center" justify="center">
      <PulseRings active={listening} />
      <AnimatedBox animatedStyle={micScale} radius="pill">
        <Touchable
          onPress={props.onPress ?? (() => undefined)}
          onPressIn={down}
          onPressOut={() => release()}
          accessibilityLabel={t('tv.voice')}
          pressScale={1}
        >
          <Box
            w={64}
            h={64}
            bg={listening ? 'accent' : 'ink'}
            radius="pill"
            align="center"
            justify="center"
          >
            <Icon name="mic" size={28} color={listening ? 'accentInk' : 'bg'} />
          </Box>
        </Touchable>
      </AnimatedBox>
      <SentRing trigger={sentCount} />
      {listening ? <ListeningBubble /> : null}
    </Box>
  );
}

/** "Listening…" with a four-bar equaliser, above and to the right of the mic. */
function ListeningBubble(): ReactElement {
  const motion = useMotion();
  const { reduced } = motion;
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, motion.timing('base', 'enter'));
    return () => cancelAnimation(shown);
  }, [shown, motion]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 2),
    transform: [{ translateY: reduced ? 0 : 6 * (1 - shown.value) }],
  }));
  return (
    <AnimatedBox
      float={{ right: 0, bottom: 78 }}
      w={220}
      align="end"
      pointerEvents="none"
      animatedStyle={style}
    >
      {/* The mock's `.mlabel`: the bars, then the 14 px bold label, 8 px by 14 px inside. */}
      <Box direction="row" align="center" bg="ink" radius="pill" py={2}>
        <Box w={14} />
        <Equaliser active />
        <Box w={8} />
        <Txt variant="bodyBold" size="banner" color="bg" live>
          {t('tv.listening')}
        </Txt>
        <Box w={14} />
      </Box>
    </AnimatedBox>
  );
}
