import type { ReactElement, ReactNode } from 'react';
import { t } from '@/i18n';
import { Box, Row, Txt } from '@/ui';
import { BarButton } from './BarButton';

/** The TV screen's one compact bar: back, name over status, then the round icon buttons. */
export function TvBar(props: {
  name: string;
  status: string | null;
  onBack: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <Row gap={1} align="center">
      <BarButton glyph="‹" label={t('common.back')} onPress={props.onBack} />
      <Box flex={1}>
        <Txt variant="bodyBold" numberOfLines={1}>
          {props.name}
        </Txt>
        {props.status ? (
          <Txt variant="caption" color="ink2" numberOfLines={1} live>
            {props.status}
          </Txt>
        ) : null}
      </Box>
      {props.children}
    </Row>
  );
}
