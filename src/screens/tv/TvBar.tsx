import type { ReactElement, ReactNode } from 'react';
import { t } from '@/i18n';
import { Box, IconButton, Row, StatusDot, Txt } from '@/ui';
import type { StatusDotProps } from '@/ui';

export interface TvStatus {
  text: string;
  tone: StatusDotProps['tone'];
  /** Blinks while the link is being checked. */
  live?: boolean;
}

/** The TV screen's one compact bar: back, name over status, then the round icon buttons. */
export function TvBar(props: {
  name: string;
  status: TvStatus | null;
  onBack: () => void;
  children: ReactNode;
}): ReactElement {
  const { status } = props;
  return (
    <Row gap={2} align="center">
      <IconButton icon="back" label={t('common.back')} onPress={props.onBack} />
      <Box flex={1}>
        <Txt variant="heading" numberOfLines={1}>
          {props.name}
        </Txt>
        {status ? (
          <Row gap={2} align="center">
            <StatusDot tone={status.tone} live={status.live} />
            <Txt variant="caption" color="ink2" numberOfLines={1} live>
              {status.text}
            </Txt>
          </Row>
        ) : null}
      </Box>
      {props.children}
    </Row>
  );
}
