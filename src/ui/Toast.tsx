import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useMotion, useTheme } from '@/theme';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { AnimatedBox, Box, Row, Touchable, Txt } from './primitives';

export type ToastKind = 'info' | 'ok' | 'error';

export interface ToastOptions {
  kind?: ToastKind;
  action?: { label: string; onPress: () => void };
  /** 4000 by default; 6000 when there is an action. */
  durationMs?: number;
}

export interface ToastApi {
  show(message: string, opts?: ToastOptions): void;
  hide(): void;
}

interface Shown {
  id: number;
  message: string;
  opts: ToastOptions;
}

const BASE_BOTTOM = 30;

const ToastContext = createContext<ToastApi | null>(null);

const LOOK: Record<
  ToastKind,
  { bg: ColorToken; ink: ColorToken; icon: IconName; iconInk: ColorToken }
> = {
  info: { bg: 'ink', ink: 'bg', icon: 'info', iconInk: 'bg' },
  ok: { bg: 'ink', ink: 'bg', icon: 'check', iconInk: 'toastOkIcon' },
  error: { bg: 'toastErrorBg', ink: 'toastErrorInk', icon: 'alert', iconInk: 'toastErrorInk' },
};

/**
 * One toast at a time: a new one replaces the one showing. Mount it above the navigation stack;
 * the toast floats over the provider's parent, so that parent must fill the screen.
 */
export function ToastProvider(props: { children: ReactNode }): ReactElement {
  const motion = useMotion();
  const fastMs = motion.duration.fast;
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clear = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    exitTimer.current = null;
  }, []);
  const hide = useCallback((): void => {
    clear();
    setShown(null);
    setLeaving(false);
  }, [clear]);
  const show = useCallback(
    (message: string, opts: ToastOptions = {}): void => {
      clear();
      counter.current += 1;
      setShown({ id: counter.current, message, opts });
      setLeaving(false);
      const total = opts.durationMs ?? (opts.action ? 6000 : 4000);
      // The exit animation plays inside the last `fast` of the toast's time on screen.
      exitTimer.current = setTimeout(
        () => {
          exitTimer.current = null;
          setLeaving(true);
        },
        Math.max(0, total - fastMs),
      );
      timer.current = setTimeout(() => {
        timer.current = null;
        setShown(null);
        setLeaving(false);
      }, total);
    },
    [clear, fastMs],
  );
  // No timer may fire after the provider is gone.
  useEffect(() => clear, [clear]);

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      {shown ? <ToastView key={shown.id} shown={shown} leaving={leaving} hide={hide} /> : null}
    </ToastContext.Provider>
  );
}

/** The keyboard's height while it is up, so the toast is never hidden behind it. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function ToastView(props: { shown: Shown; leaving: boolean; hide: () => void }): ReactElement {
  const { shown } = props;
  const theme = useTheme();
  const motion = useMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const keyboard = useKeyboardHeight();
  const kind = shown.opts.kind ?? 'info';
  const look = LOOK[kind];

  // 0 = hidden, 1 = shown. In: `base` `enter`; out: `fast` `exit` to half the lift.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = props.leaving
      ? withTiming(0, motion.timing('fast', 'exit'))
      : withTiming(1, motion.timing('base', 'enter'));
  }, [props.leaving, progress, motion]);
  const lift = motion.lift;
  const out = props.leaving;
  const reduced = motion.reduced;
  const animatedStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: progress.value };
    // Arrives from `lift` below at scale .98; leaves to half the lift (progress 0 -> 1 -> 0).
    return {
      opacity: progress.value,
      transform: [
        { translateY: out ? (1 - progress.value) * lift * 0.5 : (1 - progress.value) * lift },
        { scale: out ? 1 : 0.98 + 0.02 * progress.value },
      ],
    };
  });

  const bottom = Math.max(insets?.bottom ?? 0, keyboard) + BASE_BOTTOM;
  return (
    <AnimatedBox
      testID="toast"
      float={{ left: 16, right: 16, bottom }}
      bg={look.bg}
      border={theme.dark ? 'line' : undefined}
      radius="md"
      shadow="pop"
      minH={52}
      py={2}
      px={2}
      justify="center"
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'error' ? undefined : 'polite'}
      animatedStyle={animatedStyle}
    >
      <Row gap={3} align="center">
        <Box w={8} />
        <Icon name={look.icon} size={20} color={look.iconInk} />
        <Box flex={1}>
          <Txt variant="label" color={look.ink}>
            {shown.message}
          </Txt>
        </Box>
        {shown.opts.action ? (
          <ToastAction
            label={shown.opts.action.label}
            ink={look.ink}
            onPress={() => {
              shown.opts.action?.onPress();
              props.hide();
            }}
          />
        ) : null}
      </Row>
    </AnimatedBox>
  );
}

function ToastAction(props: { label: string; ink: ColorToken; onPress: () => void }): ReactElement {
  return (
    <Touchable onPress={props.onPress} accessibilityLabel={props.label} radius="pill">
      <Box px={3} minH={48} justify="center">
        <Txt variant="label" color={props.ink}>
          {props.label}
        </Txt>
        {/* The underline: Txt has no decoration, so a 1 px rule sits under the label. */}
        <Box h={1} bg={props.ink} />
      </Box>
    </Touchable>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
