import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Row, Txt } from './primitives';

export interface BannerProps {
  text: string;
  tone?: 'info' | 'ok' | 'error';
  icon?: IconName;
  testID?: string;
}

const LOOK: Record<NonNullable<BannerProps['tone']>, { bg: ColorToken; icon: IconName }> = {
  info: { bg: 'warmSoft', icon: 'info' },
  ok: { bg: 'okSoft', icon: 'check' },
  error: { bg: 'dangerSoft', icon: 'alert' },
};

export function Banner(props: BannerProps): ReactElement {
  const look = LOOK[props.tone ?? 'info'];
  return (
    <Box bg={look.bg} radius="md" px={4} py={3} testID={props.testID}>
      <Row gap={3} align="start">
        <Icon name={props.icon ?? look.icon} size={20} color="ink" />
        <Box flex={1}>
          <Txt variant="caption">{props.text}</Txt>
        </Box>
      </Row>
    </Box>
  );
}
