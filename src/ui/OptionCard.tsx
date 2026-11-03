import type { ReactElement } from 'react';
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
  /** A choice in a list: draws a radio (ticked when picked) on the right, an accent border and reports `selected`. */
  selected?: boolean;
  /** Position in a staggered list (the card rises in after `index` steps). */
  index?: number;
  accessibilityLabel?: string;
  testID?: string;
}

/** A big choice row: tile, name, optional badge and a chevron. */
export function OptionCard(props: OptionCardProps): ReactElement {
  const card = (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      disabled={props.disabled}
      testID={props.testID}
      selected={props.selected}
      bg="surface"
      border={props.selected ? 'accent' : 'line'}
      radius="md"
      pressedBg="surface2"
      pressScale={0.985}
    >
      <Row gap={4} align="center" px={5} py={4} minH={88}>
        <Tile icon={props.icon} size={56} />
        <Box flex={1}>
          <Column gap={1}>
            <Txt variant="bodyBold" size="cardName">
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
          // A choice in a list (the mock's radio): an empty ring, filled accent with a tick when picked.
          <Box
            w={24}
            h={24}
            radius="pill"
            align="center"
            justify="center"
            bg={props.selected ? 'accent' : undefined}
            border={props.selected ? 'accent' : 'ink2'}
            testID="option-radio"
          >
            {props.selected ? (
              <Icon name="check" size={16} color="accentInk" strokeWidth={3.2} />
            ) : null}
          </Box>
        ) : (
          <Icon name="chev" size={22} color="ink2" />
        )}
      </Row>
    </Touchable>
  );
  return props.index === undefined ? card : <Rise index={props.index}>{card}</Rise>;
}
