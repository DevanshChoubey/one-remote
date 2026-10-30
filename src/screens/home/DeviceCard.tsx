import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Card, Column, Row, Toggle, Touchable, Txt } from '@/ui';
import { cardSummary } from './summary';
import type { HomeCard } from './useHome';

export interface DeviceCardProps {
  card: HomeCard;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
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
            // A card that cannot be used still opens its settings on a long press (to remove it).
            onPress={disabled ? () => undefined : () => props.onOpen(device.id)}
            onLongPress={() => props.onSettings(device.id)}
            dimmed={disabled}
            accessibilityHint={t('home.longPressHint')}
            accessibilityLabel={summary ? `${device.name}, ${summary}` : device.name}
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
