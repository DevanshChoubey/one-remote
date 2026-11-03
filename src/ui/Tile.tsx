import type { ReactElement } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box } from './primitives';

export interface TileProps {
  icon: IconName;
  size?: 44 | 56;
  tone?: 'ink' | 'accent';
}

export function Tile(props: TileProps): ReactElement {
  const size = props.size ?? 44;
  return (
    <Box
      w={size}
      h={size}
      radius={size === 44 ? 'tile' : 'md'}
      bg="surface2"
      align="center"
      justify="center"
    >
      <Icon name={props.icon} size={size === 44 ? 24 : 30} color={props.tone ?? 'ink'} />
    </Box>
  );
}
