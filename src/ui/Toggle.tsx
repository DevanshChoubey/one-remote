import type { ReactElement } from 'react';
import { Switch } from 'react-native';
import { useTheme } from '@/theme';
import { Row, Touchable, Txt } from './primitives';

export interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Keeps the spoken label but shows only the switch (e.g. on a card that already names it). */
  hideLabel?: boolean;
}

/** The whole row is the control: one announcement, and tapping the label toggles it. */
export function Toggle(props: ToggleProps): ReactElement {
  const theme = useTheme();
  return (
    <Touchable
      onPress={() => props.onChange(!props.value)}
      accessibilityLabel={props.label}
      accessibilityRole="switch"
      checked={props.value}
      disabled={props.disabled}
    >
      <Row align="center" justify={props.hideLabel ? 'end' : 'between'} gap={3}>
        {props.hideLabel ? null : <Txt variant="bodyBold">{props.label}</Txt>}
        <Switch
          value={props.value}
          disabled={props.disabled}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          trackColor={{ false: theme.color.ink2, true: theme.color.accent }}
          thumbColor={theme.color.surface}
        />
      </Row>
    </Touchable>
  );
}
