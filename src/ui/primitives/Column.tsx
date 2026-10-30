import type { ReactElement } from 'react';
import { Box } from './Box';
import type { BoxProps } from './Box';

export function Column(props: BoxProps): ReactElement {
  return <Box direction="column" {...props} />;
}
