import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Card, Column, Row, Toggle, Touchable, Txt } from '@/ui';
import { cardSummary } from './summary';
import type { HomeCard } from './useHome';

export interface DeviceCardProps {
  card: HomeCard;
  onOpen: (id: string) => void;
  onTogglePower: (id: string) => void;
}

export function DeviceCard(props: DeviceCardProps): ReactElement {
  const { view, needsIr } = props.card;
  const { device } = view;
  const disabled = !view.usable;
  const summary = needsIr ? t('home.needsIr') : cardSummary(view);
  return (
    <Card testID={`device-card-${device.id}`}>
      <Row align="center" justify="between" gap={3}>
        <Box flex={1}>
          <Touchable
            onPress={() => props.onOpen(device.id)}
            accessibilityLabel={summary ? `${device.name}, ${summary}` : device.name}
            disabled={disabled}
          >
            <Column gap={1}>
              <Txt variant="bodyBold">{device.name}</Txt>
              {summary ? (
                <Txt variant="caption" color="ink2">
                  {summary}
                </Txt>
              ) : null}
            </Column>
          </Touchable>
        </Box>
        {device.kind === 'ac' || device.kind === 'fan' ? (
          <Toggle
            label={t('home.power', { name: device.name })}
            value={props.card.power}
            hideLabel
            onChange={() => props.onTogglePower(device.id)}
            disabled={disabled}
          />
        ) : null}
      </Row>
    </Card>
  );
}
