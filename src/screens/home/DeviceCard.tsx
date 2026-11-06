import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useMotion, useTheme } from '@/theme';
import { AnimatedBox, Box, Rise, Row, Spacer, Tile, Toggle, Touchable, Txt } from '@/ui';
import type { DeviceKind } from '@/core';
import type { IconName } from '@/ui';
import { mixColor } from '@/ui/primitives/Touchable';
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

const TILE: Record<DeviceKind, IconName> = { tv: 'tv', ac: 'ac', fan: 'fan', aer: 'aer' };
/** The mock's `.card:has(.opn:active)`: the whole card scales and darkens one step. */
const PRESS_SCALE = 0.985;

export function DeviceCard(props: DeviceCardProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const { view, needsIr } = props.card;
  const { device } = view;
  const summary = needsIr ? t('home.needsIr') : cardSummary(view);

  // 0 at rest, 1 while the open area is held: drives the card's scale and background.
  const press = useSharedValue(0);
  const target = motion.reduced ? 1 : PRESS_SCALE;
  const rest = theme.color.surface;
  const held = theme.color.surface2;
  const pressed = useAnimatedStyle(
    () => ({
      backgroundColor: mixColor(press.value, rest, held),
      transform: [{ scale: 1 + (target - 1) * press.value }],
    }),
    [rest, held, target],
  );

  // Every card opens its remote, an IR-only one too: its controls are shown inert there.
  const card = (
    <AnimatedBox
      bg="surface"
      border="line"
      radius="md"
      shadow="card"
      direction="row"
      align="stretch"
      minH={76}
      animatedStyle={pressed}
      testID={`device-card-${device.id}`}
    >
      <Touchable
        // The open area reaches the card's edges, so the whole card (but the switch) opens it.
        onPress={() => props.onOpen(device.id)}
        // A card that cannot be used still opens its settings on a long press (to remove it).
        onLongPress={() => props.onSettings(device.id)}
        onPressIn={() => {
          press.set(withTiming(1, motion.timing('instant')));
        }}
        onPressOut={() => {
          press.set(withTiming(0, motion.timing('fast', 'spring')));
        }}
        pressScale={1}
        radius="md"
        flex={1}
        accessibilityHint={t('home.longPressHint')}
        accessibilityActions={[
          { name: 'settings', label: t('device.open') },
          { name: 'remove', label: t('device.remove') },
        ]}
        onAccessibilityAction={(e) => {
          // Remove lives in the device's settings sheet, so both open it.
          const name = e.nativeEvent.actionName;
          if (name === 'settings' || name === 'remove') props.onSettings(device.id);
        }}
        accessibilityLabel={summary ? `${device.name}, ${summary}` : device.name}
        testID={`device-open-${device.id}`}
      >
        <Box py={4} px={4}>
          <Row gap={3} align="center">
            <Tile icon={TILE[device.kind]} tone="ink" />
            <Box flex={1}>
              <Txt variant="bodyBold">{device.name}</Txt>
              {summary ? (
                <Txt variant="caption" color="ink2">
                  {summary}
                </Txt>
              ) : null}
            </Box>
          </Row>
        </Box>
      </Touchable>
      {/* 20 px from the text (the mock's 12 px gap and the switch's 8 px pad), 16 from the edge. */}
      <Row align="center">
        <Spacer size={1} />
        <Toggle
          label={t('home.power', { name: device.name })}
          value={props.card.power && !needsIr}
          hideLabel
          onChange={() => props.onTogglePower(device.id)}
          disabled={!props.card.canPower}
        />
        <Spacer size={4} />
      </Row>
    </AnimatedBox>
  );
  return (
    <Rise index={props.index}>
      {needsIr ? (
        <Box opacity={0.6} testID={`device-card-dim-${device.id}`}>
          {card}
        </Box>
      ) : (
        card
      )}
    </Rise>
  );
}
