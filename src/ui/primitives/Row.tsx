import type { ReactElement } from 'react';
import { Box } from './Box';
import type { BoxProps } from './Box';

export function Row(props: BoxProps): ReactElement {
  return <Box direction="row" {...props} />;
}
