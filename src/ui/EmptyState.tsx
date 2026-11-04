import type { ReactElement, ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Mark } from './Mark';
import { Box, Column, Txt } from './primitives';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Spans the full width (mock `.empty .btn`), 24 px under the body. */
  action?: ReactNode;
  /** A big icon (or the app mark) above the title. */
  art?: IconName | 'mark';
  tone?: 'accent' | 'ink2' | 'warm' | 'danger';
  /** Fills the height and centres, for a whole-screen empty state. */
  fill?: boolean;
}

const TONE: Record<NonNullable<EmptyStateProps['tone']>, ColorToken> = {
  accent: 'accent',
  ink2: 'ink2',
  warm: 'warm',
  danger: 'danger',
};

/** Extra space on top of the 12 px gap, from the mock's `.empty` margins. */
const ART_EXTRA = 8;
const MARK_EXTRA = 12;
const ACTION_EXTRA = 12;

export function EmptyState(props: EmptyStateProps): ReactElement {
  return (
    <Column
      align="center"
      justify={props.fill ? 'center' : undefined}
      flex={props.fill ? 1 : undefined}
      gap={3}
      px={4}
    >
      {props.art === 'mark' ? (
        <Mark size={96} animate={false} />
      ) : props.art ? (
        // The mock's art keeps 8 px more below it: 20 px to the title.
        <Animated.View style={{ marginBottom: ART_EXTRA }}>
          <Box
            w={104}
            h={104}
            radius="art"
            bg="surface"
            border="line"
            shadow="card"
            align="center"
            justify="center"
            testID="empty-art"
          >
            <Icon
              name={props.art}
              size={48}
              strokeWidth={1.7}
              color={TONE[props.tone ?? 'accent']}
            />
          </Box>
        </Animated.View>
      ) : null}
      {props.art === 'mark' ? (
        // The welcome title is the 30 px page title, 24 px under the mark.
        <Animated.View style={{ marginTop: MARK_EXTRA }}>
          <Txt variant="title" align="center">
            {props.title}
          </Txt>
        </Animated.View>
      ) : (
        <Txt variant="heading" align="center">
          {props.title}
        </Txt>
      )}
      {props.body ? (
        <Box maxW={300} testID="empty-body">
          <Txt color="ink2" align="center">
            {props.body}
          </Txt>
        </Box>
      ) : null}
      {props.action ? (
        <Animated.View
          style={{ alignSelf: 'stretch', marginTop: ACTION_EXTRA }}
          testID="empty-action"
        >
          {props.action}
        </Animated.View>
      ) : null}
    </Column>
  );
}
