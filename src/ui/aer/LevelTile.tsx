import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { ProgressBar } from '../ProgressBar';
import { Skeleton } from '../Skeleton';
import { Box, Row, Txt } from '../primitives';

export interface LevelTileProps {
  icon: IconName;
  label: string;
  /** 0 to 100; none before the first reading. */
  percent?: number;
  tone: 'accent' | 'warm' | 'danger';
  /** Skeletons stand in for the value and the bar. */
  loading: boolean;
  testID?: string;
}

/** Mock `.stat`: a label with a 16 px icon, the percentage at heading size, and a 6 px bar. */
export function LevelTile(props: LevelTileProps): ReactElement {
  return (
    <Box
      flex={1}
      bg="surface"
      border="line"
      radius="md"
      shadow="card"
      px={4}
      py={3}
      gap={2}
      testID={props.testID}
    >
      <Row gap={2} align="center">
        <Icon name={props.icon} size={16} color="ink2" />
        <Txt variant="captionBold" color="ink2">
          {props.label}
        </Txt>
      </Row>
      {props.loading ? (
        <Box gap={2} testID={props.testID ? `${props.testID}-loading` : undefined}>
          <Skeleton width={56} height={24} />
          <Skeleton height={6} radius="pill" />
        </Box>
      ) : (
        <>
          <Txt variant="heading" tabular color={props.tone === 'danger' ? 'dangerInk' : 'ink'}>
            {props.percent === undefined ? '–' : t('aer.percent', { n: props.percent })}
          </Txt>
          <ProgressBar value={(props.percent ?? 0) / 100} label={props.label} tone={props.tone} />
        </>
      )}
    </Box>
  );
}
