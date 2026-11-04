import type { ReactElement } from 'react';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Badge } from './Badge';
import type { BadgeProps } from './Badge';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Column, Row, Touchable, Txt } from './primitives';
import { Rise } from './Rise';
import { Tile } from './Tile';

export interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
  badge?: BadgeProps;
  disabled?: boolean;
  /** A choice in a list: draws a radio (ticked when picked) on the right, an accent ring and reports `selected`. */
  selected?: boolean;
  /**
   * `large` (the default) is the mock's `.optcard` (88 high, 56 tile, 18 px name), as in the add
   * picker. `regular` is the plain `.card` row (76 high, 44 tile, 16 px name): brand lists.
   */
  size?: 'large' | 'regular';
  /** Position in a staggered list (the card rises in after `index` steps). */
  index?: number;
  accessibilityLabel?: string;
  testID?: string;
}

/** A big choice row: tile, name, optional badge and a chevron (or a radio when it is a pick). */
export function OptionCard(props: OptionCardProps): ReactElement {
  const theme = useTheme();
  const large = props.size !== 'regular';
  const card = (
    // The card's shadow sits on a resting surface behind the pressable one (mock `.card`).
    <Box bg="surface" radius="md" shadow="card">
      <Touchable
        onPress={props.onPress}
        accessibilityLabel={props.accessibilityLabel ?? props.title}
        disabled={props.disabled}
        testID={props.testID}
        selected={props.selected}
        bg="surface"
        border={props.selected ? undefined : 'line'}
        radius="md"
        pressedBg="surface2"
        pressScale={0.985}
      >
        <Row gap={large ? 4 : 3} align="center" px={large ? 5 : 4} py={4} minH={large ? 88 : 76}>
          <Tile icon={props.icon} size={large ? 56 : 44} />
          <Box flex={1}>
            <Column gap={1}>
              <Txt variant="bodyBold" size={large ? 'cardName' : undefined}>
                {props.title}
              </Txt>
              {props.subtitle ? (
                <Txt variant="caption" color="ink2">
                  {props.subtitle}
                </Txt>
              ) : null}
            </Column>
          </Box>
          {props.badge ? <Badge {...props.badge} /> : null}
          {props.selected !== undefined ? (
            // A choice in a list (the mock's radio): a 2 px ink2 ring, filled accent with a tick
            // when picked.
            <Animated.View
              testID="option-radio"
              style={{
                width: 24,
                height: 24,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                ...(props.selected
                  ? { backgroundColor: theme.color.accent }
                  : { borderWidth: 2, borderColor: theme.color.ink2 }),
              }}
            >
              {props.selected ? (
                <Icon name="check" size={16} color="accentInk" strokeWidth={3.2} />
              ) : null}
            </Animated.View>
          ) : (
            <Icon name="chev" size={22} color="ink2" />
          )}
        </Row>
        {props.selected ? (
          // The picked card's 2 px accent ring (mock `.pick.sel`).
          <Animated.View
            testID="option-ring"
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: theme.radius.md,
              borderWidth: 2,
              borderColor: theme.color.accent,
            }}
          />
        ) : null}
      </Touchable>
    </Box>
  );
  return props.index === undefined ? card : <Rise index={props.index}>{card}</Rise>;
}
