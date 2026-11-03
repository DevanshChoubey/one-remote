import { Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Modal } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { Icon } from './Icon';
import { AnimatedBox, Box, Row, Touchable, Txt } from './primitives';

export interface MenuItem {
  key: string;
  label: string;
  onPress: () => void;
  /** The option in use: marked selected and drawn quieter. */
  current?: boolean;
  dividerBefore?: boolean;
}

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  items: readonly MenuItem[];
  testID?: string;
  /**
   * Called once the exit animation has finished after `open` turned false (at once under reduced
   * motion). Open a follow-up Modal from here: two native Modals cannot be presented at once on iOS.
   */
  onClosed?: () => void;
}

const PANEL_W = 220;
/** The mock's `.menu` padding and check size. */
const PANEL_PAD = 6;
const CHECK = 24;
/** The mock puts the menu 104 px from the top of a phone whose status bar is 44 px: 60 px below it. */
const BELOW_STATUS_BAR = 60;

/**
 * A pop-up menu under the top-right of the bar. A tap outside, or Android back, closes it. It
 * grows from its top-right corner (`base`, `enter`, scale .9 to 1 with a half-lift drop) and
 * leaves in `fast` (`exit`, to scale .96). Reduced motion: fade only.
 */
export function Menu(props: MenuProps): ReactElement | null {
  const motion = useMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const [mounted, setMounted] = useState(props.open);
  const progress = useSharedValue(0);
  const reduced = motion.reduced;
  const drop = motion.lift / 2;

  // Mount as soon as `open` turns true (adjusting state while rendering, not in an effect).
  if (props.open && !mounted) setMounted(true);
  const unmount = useCallback((): void => setMounted(false), []);
  const onClosedRef = useRef(props.onClosed);
  useEffect(() => {
    onClosedRef.current = props.onClosed;
  }, [props.onClosed]);
  const wasOpen = useRef(props.open);
  const closingRef = useRef(false);
  const notify = useCallback((): void => onClosedRef.current?.(), []);
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
      progress.value = withTiming(1, motion.timing('base', 'enter'));
      return;
    }
    if (closing) closingRef.current = true;
    progress.value = withTiming(0, motion.timing('fast', 'exit'), (finished) => {
      if (!finished) return;
      runOnJS(unmount)();
      if (!reduced) runOnJS(finishClose)();
    });
    if (closing && reduced) {
      closingRef.current = false;
      notify();
    }
  }, [props.open, progress, motion, reduced, unmount, notify, finishClose]);

  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: progress.value };
    const scale = 0.9 + 0.1 * progress.value;
    // Scale about the top-right corner: shift by half the size change on each axis.
    return {
      opacity: progress.value,
      transform: [
        { translateY: (1 - progress.value) * -drop },
        { translateX: (PANEL_W * (1 - scale)) / 2 },
        { scale },
      ],
    };
  });

  // While the exit plays (`open` already false) a scrim press or Android back must do nothing.
  const close = (): void => {
    if (props.open) props.onClose();
  };
  if (!props.open && !mounted) return null;
  const top = BELOW_STATUS_BAR + (insets?.top ?? 0);
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={close}
      testID={props.testID ? `${props.testID}-modal` : undefined}
      statusBarTranslucent
    >
      <Box flex={1}>
        <Box float={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          <Touchable onPress={close} accessibilityLabel={t('common.close')} fill>
            <Box flex={1} />
          </Touchable>
        </Box>
        <AnimatedBox
          float={{ top, right: 16 }}
          bg="surface"
          border="line"
          radius="md"
          shadow="pop"
          w={PANEL_W}
          testID={props.testID}
          animatedStyle={style}
        >
          <Animated.View style={{ padding: PANEL_PAD }}>
            {props.items.map((item) => (
              <Fragment key={item.key}>
                {item.dividerBefore ? (
                  // The mock's `hr`: 4 px above and below, 8 px in from the sides.
                  <Box px={2} py={1} testID="menu-divider">
                    <Box h={1} bg="line" />
                  </Box>
                ) : null}
                <Touchable
                  onPress={() => {
                    if (props.open) item.onPress();
                  }}
                  accessibilityLabel={item.label}
                  selected={item.current}
                  pressedBg="surface2"
                  radius="sm"
                  pressScale={1}
                >
                  <Row align="center" justify="between" gap={3} px={4} minH={48}>
                    <Txt color={item.current ? 'ink2' : 'ink'}>{item.label}</Txt>
                    {item.current ? <Icon name="check" size={CHECK} color="ink2" /> : null}
                  </Row>
                </Touchable>
              </Fragment>
            ))}
          </Animated.View>
        </AnimatedBox>
      </Box>
    </Modal>
  );
}
