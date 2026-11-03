import type { ReactElement } from 'react';
import type { RadiusToken } from '@/theme';
import { Box, Row } from './primitives';
import { Tile } from './Tile';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height: number;
  radius?: RadiusToken;
}

/** A grey placeholder bar. */
export function Skeleton(props: SkeletonProps): ReactElement {
  return <Box bg="line" w={props.width} h={props.height} radius={props.radius ?? 'sm'} />;
}

/** A device card while it loads: tile, two bars and a switch pill. */
export function SkelCard(): ReactElement {
  return (
    <Box bg="surface" border="line" radius="md" shadow="card" p={4}>
      <Row gap={3} align="center">
        <Tile icon="room" />
        <Box flex={1} gap={2}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="35%" height={12} />
        </Box>
        <Skeleton width={52} height={32} radius="pill" />
      </Row>
    </Box>
  );
}
