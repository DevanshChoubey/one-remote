import type { ReactElement } from 'react';
import { Badge } from './Badge';
import type { BadgeProps } from './Badge';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Column, Row, Touchable, Txt } from './primitives';
import { Tile } from './Tile';

export interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
  badge?: BadgeProps;
  disabled?: boolean;
  /** Position in a staggered list (the rise is added with the motion). */
  index?: number;
  accessibilityLabel?: string;
  testID?: string;
}

/** A big choice row: tile, name, optional badge and a chevron. */
export function OptionCard(props: OptionCardProps): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      disabled={props.disabled}
      testID={props.testID}
      bg="surface"
      border="line"
      radius="md"
      pressedBg="surface2"
      pressScale={0.985}
    >
      <Row gap={3} align="center" px={4} minH={88}>
        <Tile icon={props.icon} size={56} />
        <Box flex={1}>
          <Column gap={1}>
            <Txt variant="bodyBold">{props.title}</Txt>
            {props.subtitle ? (
              <Txt variant="caption" color="ink2">
                {props.subtitle}
              </Txt>
            ) : null}
          </Column>
        </Box>
        {props.badge ? <Badge {...props.badge} /> : null}
        <Icon name="chev" size={20} color="ink2" />
      </Row>
    </Touchable>
  );
}
