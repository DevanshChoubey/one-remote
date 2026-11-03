import type { ReactElement, ReactNode } from 'react';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Mark } from './Mark';
import { Box, Column, Txt } from './primitives';

export interface EmptyStateProps {
  title: string;
  body: string;
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

export function EmptyState(props: EmptyStateProps): ReactElement {
  return (
    <Column
      align="center"
      justify={props.fill ? 'center' : undefined}
      flex={props.fill ? 1 : undefined}
      gap={3}
      p={6}
    >
      {props.art === 'mark' ? (
        <Mark size={96} />
      ) : props.art ? (
        <Box
          w={104}
          h={104}
          radius="art"
          bg="surface"
          border="line"
          shadow="card"
          align="center"
          justify="center"
        >
          <Icon name={props.art} size={48} strokeWidth={1.7} color={TONE[props.tone ?? 'accent']} />
        </Box>
      ) : null}
      <Txt variant="heading">{props.title}</Txt>
      <Txt color="ink2">{props.body}</Txt>
      {props.action}
    </Column>
  );
}
