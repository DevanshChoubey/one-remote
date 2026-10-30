import type { ReactElement, ReactNode } from 'react';
import { Column } from './primitives';

export interface CardProps {
  children: ReactNode;
  testID?: string;
}

export function Card(props: CardProps): ReactElement {
  return (
    <Column
      bg="surface"
      border="line"
      radius="md"
      shadow="card"
      p={4}
      gap={3}
      testID={props.testID}
    >
      {props.children}
    </Column>
  );
}
