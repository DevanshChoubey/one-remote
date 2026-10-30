import type { ReactElement, ReactNode } from 'react';
import { Column, Txt } from './primitives';

export interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState(props: EmptyStateProps): ReactElement {
  return (
    <Column align="center" gap={3} p={6}>
      <Txt variant="heading">{props.title}</Txt>
      <Txt color="ink2">{props.body}</Txt>
      {props.action}
    </Column>
  );
}
