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
    <Box w={size} h={size} radius="tile" bg="surface2" align="center" justify="center">
      <Icon name={props.icon} size={size === 44 ? 24 : 28} color={props.tone ?? 'ink'} />
    </Box>
  );
}
