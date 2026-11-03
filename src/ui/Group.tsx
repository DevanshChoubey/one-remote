import { Children, Fragment } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Icon } from './Icon';
import { Badge } from './Badge';
import type { BadgeProps } from './Badge';
import { Box, Column, Row, Touchable, Txt } from './primitives';

export interface GroupProps {
  children: ReactNode;
  /** A small heading above the group. */
  label?: string;
}

/** A card of rows with 1 px dividers. */
export function Group(props: GroupProps): ReactElement {
  const rows = Children.toArray(props.children);
  return (
    <Column gap={2}>
      {props.label ? (
        <Txt variant="label" color="ink2">
          {props.label}
        </Txt>
      ) : null}
      <Box bg="surface" border="line" radius="md">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <Box h={1} bg="line" /> : null}
            {row}
          </Fragment>
        ))}
      </Box>
    </Column>
  );
}

export interface ListItemProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: 'chevron' | 'expand' | ReactNode;
  badge?: BadgeProps;
  expanded?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

function Trailing(props: Pick<ListItemProps, 'trailing' | 'expanded'>): ReactElement | null {
  if (props.trailing === 'chevron') return <Icon name="chev" size={20} color="ink2" />;
  if (props.trailing === 'expand') {
    return <Icon name={props.expanded ? 'up' : 'down'} size={20} color="ink2" />;
  }
  return <>{props.trailing}</>;
}

/** A 56 px row for a Group. */
export function ListItem(props: ListItemProps): ReactElement {
  const body = (
    <Row gap={3} align="center" px={4} py={2} minH={56}>
      <Box flex={1}>
        <Txt variant="bodyBold">{props.title}</Txt>
        {props.subtitle ? (
          <Txt variant="caption" color="ink2">
            {props.subtitle}
          </Txt>
        ) : null}
      </Box>
      {props.badge ? <Badge {...props.badge} /> : null}
      <Trailing trailing={props.trailing} expanded={props.expanded} />
    </Row>
  );
  if (!props.onPress) return <Box testID={props.testID}>{body}</Box>;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      disabled={props.disabled}
      expanded={props.trailing === 'expand' ? props.expanded === true : undefined}
      testID={props.testID}
      pressedBg="surface2"
      pressScale={1}
    >
      {body}
    </Touchable>
  );
}
