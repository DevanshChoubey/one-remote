import type { ReactElement } from 'react';
import { Icon } from './Icon';
import { Box } from './primitives';

export interface ResultDiscProps {
  kind: 'ok' | 'bad';
  label: string;
}

export function ResultDisc(props: ResultDiscProps): ReactElement {
  return (
    <Box
      w={96}
      h={96}
      radius="pill"
      bg={props.kind === 'ok' ? 'okInk' : 'dangerInk'}
      align="center"
      justify="center"
      accessibilityLabel={props.label}
      accessibilityRole="image"
    >
      <Icon name={props.kind === 'ok' ? 'check' : 'alert'} size={48} color="onFill" />
    </Box>
  );
}
