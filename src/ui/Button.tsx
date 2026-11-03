import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Row, Touchable, Txt } from './primitives';
import { Spinner } from './Spinner';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `key` is 56 px and full width; `small` is 48 px and as wide as its label. */
  size?: 'key' | 'small';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  /** Spoken name when it differs from the visible label. */
  accessibilityLabel?: string;
}

const LOOK: Record<
  NonNullable<ButtonProps['variant']>,
  { bg?: ColorToken; border?: ColorToken; text: ColorToken; pressed: ColorToken }
> = {
  primary: { bg: 'accent', text: 'accentInk', pressed: 'accentPressed' },
  secondary: { bg: 'surface2', border: 'line', text: 'ink', pressed: 'surface2Pressed' },
  ghost: { text: 'accent', pressed: 'accentSoft' },
  danger: { bg: 'dangerSoft', border: 'dangerLine', text: 'dangerInk', pressed: 'dangerLine' },
};

export function Button(props: ButtonProps): ReactElement {
  const look = LOOK[props.variant ?? 'primary'];
  const small = props.size === 'small' || props.variant === 'ghost';
  const blocked = props.disabled === true || props.loading === true;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      disabled={blocked}
      selected={props.selected}
      busy={props.loading === true ? true : undefined}
      bg={look.bg}
      border={look.border}
      radius="pill"
      pressedBg={look.pressed}
      alignSelf={props.size === 'small' ? 'flex-start' : undefined}
    >
      <Row gap={2} align="center" justify="center" px={small ? 5 : 6} minH={small ? 48 : 56}>
        {props.loading ? (
          <Spinner size="sm" color={look.text} />
        ) : props.icon ? (
          <Icon name={props.icon} size={20} color={look.text} />
        ) : null}
        <Txt variant="bodyBold" color={look.text}>
          {props.label}
        </Txt>
      </Row>
    </Touchable>
  );
}
