import type { ReactElement } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken } from '@/theme';
import { Box, Row, Touchable, Txt } from './primitives';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  /** Spoken name when it differs from the visible label. */
  accessibilityLabel?: string;
}

const LOOK: Record<
  NonNullable<ButtonProps['variant']>,
  { bg?: ColorToken; border?: ColorToken; text: ColorToken }
> = {
  primary: { bg: 'accent', text: 'accentInk' },
  secondary: { bg: 'surface2', border: 'line', text: 'ink' },
  ghost: { text: 'accent' },
};

export function Button(props: ButtonProps): ReactElement {
  const theme = useTheme();
  const look = LOOK[props.variant ?? 'primary'];
  const blocked = props.disabled === true || props.loading === true;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      disabled={blocked}
      selected={props.selected}
      busy={props.loading === true ? true : undefined}
    >
      <Box bg={look.bg} border={look.border} radius="pill" px={6} py={4}>
        <Row gap={2} align="center" justify="center">
          {props.loading ? (
            <ActivityIndicator
              color={theme.color[look.text]}
              accessible={false}
              importantForAccessibility="no"
            />
          ) : props.icon ? (
            <Txt variant="bodyBold" color={look.text}>
              {props.icon}
            </Txt>
          ) : null}
          <Txt variant="bodyBold" color={look.text}>
            {props.label}
          </Txt>
        </Row>
      </Box>
    </Touchable>
  );
}
