import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, useWindowDimensions } from 'react-native';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { IconButton } from './IconButton';
import { useToastHost } from './Toast';
import { AnimatedBox, Box, Row, Scroll, Touchable, Txt } from './primitives';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
  /**
   * Called once the exit animation has finished after `open` turned false (at once under reduced
   * motion). A route that renders the Sheet sets `open` false and leaves from here, so the exit
   * is seen.
   */
  onClosed?: () => void;
}

/**
 * A bottom sheet. Android back and a tap on the scrim both close it. The scrim fades in (`base`)
 * and the panel slides up from the bottom (`slow`, `enter`); closing plays out in `base` (`exit`)
 * before the Modal goes. Reduced motion: both fade. The body scrolls and lifts above the keyboard.
 */
export function Sheet(props: SheetProps): ReactElement | null {
  const motion = useMotion();
  const { height: windowHeight } = useWindowDimensions();
  // Stays mounted while the exit animation plays after `open` turns false.
  const [mounted, setMounted] = useState(props.open);
  const progress = useSharedValue(0);
  const reduced = motion.reduced;
  const toastHost = useToastHost();

  // Mount as soon as `open` turns true (adjusting state while rendering, not in an effect).
  if (props.open && !mounted) setMounted(true);
  const onClosedRef = useRef(props.onClosed);
  useEffect(() => {
    onClosedRef.current = props.onClosed;
  }, [props.onClosed]);
  const wasOpen = useRef(props.open);
  const unmount = useCallback((): void => setMounted(false), []);
  const notify = useCallback((): void => onClosedRef.current?.(), []);
  const closingRef = useRef(false);
  const finishClose = useCallback((): void => {
    if (!closingRef.current) return;
    closingRef.current = false;
    notify();
  }, [notify]);
  useEffect(() => {
    const closing = wasOpen.current && !props.open;
    wasOpen.current = props.open;
    if (props.open) {
      closingRef.current = false;
      progress.value = withTiming(1, motion.timing(reduced ? 'base' : 'slow', 'enter'));
      return;
    }
    if (closing) closingRef.current = true;
    progress.value = withTiming(0, motion.timing('base', 'exit'), (finished) => {
      if (!finished) return;
      runOnJS(unmount)();
      // Only a real close notifies: not a mount with `open` false, nor a motion change while shut.
      if (!reduced) runOnJS(finishClose)();
    });
    // Reduced motion: the caller may leave at once; the fade is only seen if it stays.
    if (closing && reduced) {
      closingRef.current = false;
      notify();
    }
  }, [props.open, progress, motion, reduced, unmount, notify, finishClose]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: progress.value }
      : { transform: [{ translateY: (1 - progress.value) * windowHeight }] },
  );

  // A scrim press, the close button or Android back while the exit plays must do nothing.
  const close = (): void => {
    if (props.open) props.onClose();
  };
  if (!props.open && !mounted) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={close}
      testID={props.testID}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <AnimatedBox
          float={{ top: 0, left: 0, right: 0, bottom: 0 }}
          bg="scrim"
          animatedStyle={scrimStyle}
        >
          <Touchable onPress={close} accessibilityLabel={t('common.close')} fill>
            <Box flex={1} />
          </Touchable>
        </AnimatedBox>
        <AnimatedBox
          bg="bg"
          topRadius="sheet"
          shadow="sheet"
          maxH="90%"
          py={2}
          animatedStyle={panelStyle}
        >
          <Box align="center" py={2}>
            <Box w={40} h={5} radius="pill" bg="line" />
          </Box>
          <Row align="center" px={5} gap={2}>
            <Box flex={1}>
              <Txt variant="heading">{props.title}</Txt>
            </Box>
            <IconButton icon="close" label={t('common.close')} onPress={close} flat />
          </Row>
          <Scroll keyboardShouldPersistTaps="handled" px={5} py={3} contentGap={3}>
            {props.children}
          </Scroll>
          {props.footer ? (
            <Box px={5} py={2}>
              {props.footer}
            </Box>
          ) : null}
        </AnimatedBox>
      </KeyboardAvoidingView>
      {toastHost.node ? (
        <AnimatedBox float={{ top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          {toastHost.node}
        </AnimatedBox>
      ) : null}
    </Modal>
  );
}
