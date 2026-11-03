import type { ReactElement, ReactNode } from 'react';
import { Box } from './primitives';
import { Rise } from './Rise';

export interface CardProps {
  children: ReactNode;
  testID?: string;
  /** Looks switched off (0.6). */
  off?: boolean;
  /** Position in a staggered list: the card rises in after `index` steps. */
  index?: number;
  /** Lays children out in a row, at least 76 high. */
  row?: boolean;
}

export function Card(props: CardProps): ReactElement {
  const card = (
    <Box
      bg="surface"
      border="line"
      radius="md"
      shadow="card"
      p={4}
      gap={3}
      direction={props.row ? 'row' : 'column'}
      align={props.row ? 'center' : undefined}
      minH={props.row ? 76 : undefined}
      opacity={props.off ? 0.6 : undefined}
      testID={props.testID}
    >
      {props.children}
    </Box>
  );
  return props.index === undefined ? card : <Rise index={props.index}>{card}</Rise>;
}
