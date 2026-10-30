import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Box, Touchable, Txt } from './primitives';

export type ChipState = 'neutral' | 'selected';

export interface ChipProps {
  label: string;
  state: ChipState;
  onToggle?: () => void;
  disabled?: boolean;
}

const LOOK: Record<ChipState, { bg: ColorToken; border: ColorToken; text: ColorToken }> = {
  neutral: { bg: 'surface', border: 'line', text: 'ink' },
  selected: { bg: 'accent', border: 'accent', text: 'accentInk' },
};

const DISABLED_LOOK = { bg: 'surface2', border: 'line', text: 'ink2' } as const;

export function Chip(props: ChipProps): ReactElement {
  const look = props.disabled ? DISABLED_LOOK : LOOK[props.state];
  const selected = props.state === 'selected';
  const body = (
    <Box
      bg={look.bg}
      border={look.border}
      radius="pill"
      px={4}
      py={2}
      accessibilityLabel={props.onToggle ? undefined : props.label}
      selected={props.onToggle ? undefined : selected}
    >
      <Txt variant="bodyBold" color={look.text}>
        {props.label}
      </Txt>
    </Box>
  );
  if (!props.onToggle) return body;
  return (
    <Touchable
      onPress={props.onToggle}
      disabled={props.disabled}
      selected={selected}
      accessibilityRole="togglebutton"
      accessibilityLabel={props.label}
    >
      {body}
    </Touchable>
  );
}
