import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  // eslint-disable-next-line no-restricted-imports -- no Scroll primitive yet; see the 1C report
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { IconButton } from './IconButton';
import { AnimatedBox, Box, Row, Touchable, Txt } from './primitives';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
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

  // Mount as soon as `open` turns true (adjusting state while rendering, not in an effect).
  if (props.open && !mounted) setMounted(true);
  const unmount = useCallback((): void => setMounted(false), []);
  useEffect(() => {
    if (props.open) {
      progress.value = withTiming(1, motion.timing(reduced ? 'base' : 'slow', 'enter'));
    } else {
      progress.value = withTiming(0, motion.timing('base', 'exit'), (finished) => {
        if (finished) runOnJS(unmount)();
      });
    }
  }, [props.open, progress, motion, reduced, unmount]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: progress.value }
      : { transform: [{ translateY: (1 - progress.value) * windowHeight }] },
  );

  if (!props.open && !mounted) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={props.onClose}
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
          <Touchable onPress={props.onClose} accessibilityLabel={t('common.close')} fill>
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
            <IconButton icon="close" label={t('common.close')} onPress={props.onClose} flat />
          </Row>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
          >
            <Box px={5} py={3} gap={3}>
              {props.children}
            </Box>
          </ScrollView>
          {props.footer ? (
            <Box px={5} py={2}>
              {props.footer}
            </Box>
          ) : null}
        </AnimatedBox>
      </KeyboardAvoidingView>
    </Modal>
  );
}
