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
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Row, Touchable, Txt } from './primitives';

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
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clear = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback((): void => {
    clear();
    setShown(null);
  }, [clear]);
  const show = useCallback(
    (message: string, opts: ToastOptions = {}): void => {
      clear();
      counter.current += 1;
      setShown({ id: counter.current, message, opts });
      timer.current = setTimeout(
        () => {
          timer.current = null;
          setShown(null);
        },
        opts.durationMs ?? (opts.action ? 6000 : 4000),
      );
    },
    [clear],
  );
  // No timer may fire after the provider is gone.
  useEffect(() => clear, [clear]);

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);
  const kind = shown?.opts.kind ?? 'info';
  const look = LOOK[kind];
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      {shown ? (
        <Box
          key={shown.id}
          testID="toast"
          float={{ left: 16, right: 16, bottom: 30 }}
          bg={look.bg}
          radius="md"
          shadow="pop"
          minH={52}
          px={4}
          py={2}
          justify="center"
          accessibilityRole={kind === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion={kind === 'error' ? undefined : 'polite'}
        >
          <Row gap={3} align="center">
            <Icon name={look.icon} size={20} color={look.iconInk} />
            <Box flex={1}>
              <Txt color={look.ink}>{shown.message}</Txt>
            </Box>
            {shown.opts.action ? (
              <ToastAction
                label={shown.opts.action.label}
                ink={look.ink}
                onPress={() => {
                  shown.opts.action?.onPress();
                  hide();
                }}
              />
            ) : null}
          </Row>
        </Box>
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastAction(props: { label: string; ink: ColorToken; onPress: () => void }): ReactElement {
  return (
    <Touchable onPress={props.onPress} accessibilityLabel={props.label} radius="pill">
      <Box px={3} justify="center">
        <Txt variant="bodyBold" color={props.ink}>
          {props.label}
        </Txt>
      </Box>
    </Touchable>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
