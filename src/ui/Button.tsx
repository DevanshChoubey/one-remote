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
  /**
   * `key` (the default) is 56 px and stretches to the parent's width, even in a centring column
   * (mock `.btn`, width 100%). `small` is 48 px and as wide as its label (mock `.btn.sm`); it sets
   * no cross-axis alignment, so in a Row it follows the Row's `align`. A ghost button is 48 px
   * tall and full width like `key`, with its label centred.
   */
  size?: 'key' | 'small';
  /** Shares a Row's width with its siblings: `flex={1}` on two buttons gives equal halves. */
  flex?: number;
  /** Overrides the cross-axis alignment (rarely needed; `key` stretches, `small` follows). */
  alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
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
  const small = props.size === 'small';
  const ghost = props.variant === 'ghost';
  const loading = props.loading === true;
  const blocked = props.disabled === true || loading;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      disabled={blocked}
      selected={props.selected}
      busy={loading ? true : undefined}
      noDim={loading && props.disabled !== true}
      bg={look.bg}
      border={look.border}
      radius="pill"
      pressedBg={look.pressed}
      alignSelf={props.alignSelf ?? (small ? undefined : 'stretch')}
      flex={props.flex}
    >
      <Row
        gap={2}
        align="center"
        justify="center"
        px={small ? 5 : 6}
        minH={small || ghost ? 48 : 56}
      >
        {props.loading ? (
          <Spinner size="sm" color={look.text} />
        ) : props.icon ? (
          <Icon name={props.icon} size={20} color={look.text} />
        ) : null}
        <Txt variant="bodyBold" color={look.text} align="center">
          {props.label}
        </Txt>
      </Row>
    </Touchable>
  );
}
