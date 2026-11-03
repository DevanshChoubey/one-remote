import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from '../Icon';
import { Box, Row, Txt } from '../primitives';
import { Spinner } from '../Spinner';

export type StepState = 'idle' | 'active' | 'done' | 'fail';

export interface StepListProps {
  steps: readonly { label: string; state: StepState }[];
}

function Disc(props: { state: StepState }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const { state } = props;
  const pop = useSharedValue(1);

  useEffect(() => {
    if (state !== 'done' && state !== 'fail') {
      pop.value = 1;
      return;
    }
    // Pops from .6 to 1 on arrival; under reduced motion it just appears.
    if (motion.reduced) {
      pop.value = 1;
      return;
    }
    pop.value = 0.6;
    pop.value = withTiming(1, motion.timing('base', 'spring'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, motion.reduced]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const filled = state === 'done' || state === 'fail';
  return (
    <Animated.View
      style={[
        {
          width: 32,
          height: 32,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? theme.color[state === 'done' ? 'ok' : 'danger'] : undefined,
          borderWidth: filled ? 0 : 2,
          borderColor: theme.color[state === 'active' ? 'accent' : 'line'],
        },
        style,
      ]}
    >
      {state === 'active' ? <Spinner size="sm" /> : null}
      {state === 'done' ? <Icon name="check" size={18} strokeWidth={3} color="onFill" /> : null}
      {state === 'fail' ? <Icon name="close" size={18} strokeWidth={3} color="onFill" /> : null}
    </Animated.View>
  );
}

/** The commissioning checklist: one 64 px row per step, each with a status disc. */
export function StepList(props: StepListProps): ReactElement {
  return (
    <Box bg="surface" border="line" radius="md" shadow="card" px={4} py={2} testID="step-list">
      {props.steps.map((s, i) => (
        <Animated.View key={`${i}:${s.label}`} testID={`step-${s.state}`}>
          {i > 0 ? <Box h={1} bg="line" /> : null}
          <Row gap={4} align="center" minH={64}>
            <Disc state={s.state} />
            <Box flex={1}>
              <Txt
                variant="bodyBold"
                color={s.state === 'fail' ? 'dangerInk' : s.state === 'idle' ? 'ink2' : 'ink'}
              >
                {s.label}
              </Txt>
            </Box>
          </Row>
        </Animated.View>
      ))}
    </Box>
  );
}
