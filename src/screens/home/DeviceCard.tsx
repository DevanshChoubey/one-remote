import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Card, Row, Tile, Toggle, Touchable, Txt, useToast } from '@/ui';
import type { IconName } from '@/ui';
import { cardSummary } from './summary';
import type { HomeCard } from './useHome';

export interface DeviceCardProps {
  card: HomeCard;
  /** Position on Home, for the staggered rise. */
  index?: number;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
  onTogglePower: (id: string) => void;
}

const TILE: Record<'tv' | 'ac' | 'fan', IconName> = { tv: 'tv', ac: 'ac', fan: 'fan' };

export function DeviceCard(props: DeviceCardProps): ReactElement {
  const toast = useToast();
  const { view, needsIr } = props.card;
  const { device } = view;
  const disabled = !view.usable;
  const summary = needsIr ? t('home.needsIr') : cardSummary(view);
  const press = (): void => {
    if (needsIr) toast.show(t('home.needsIr'));
    else if (!disabled) props.onOpen(device.id);
  };
  return (
    <Card row index={props.index} off={disabled} testID={`device-card-${device.id}`}>
      <Box flex={1}>
        <Touchable
          // A card that cannot be used still opens its settings on a long press (to remove it).
          onPress={press}
          onLongPress={() => props.onSettings(device.id)}
          dimmed={disabled}
          pressScale={0.985}
          pressedBg="surface2"
          radius="md"
          accessibilityHint={t('home.longPressHint')}
          accessibilityLabel={summary ? `${device.name}, ${summary}` : device.name}
        >
          <Row gap={3} align="center">
            <Tile icon={TILE[device.kind]} tone={props.card.power ? 'accent' : 'ink'} />
            <Box flex={1} gap={1}>
              <Txt variant="bodyBold" numberOfLines={2}>
                {device.name}
              </Txt>
              {summary ? (
                <Txt variant="caption" color="ink2">
                  {summary}
                </Txt>
              ) : null}
            </Box>
          </Row>
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
    </Card>
  );
}
