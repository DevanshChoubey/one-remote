import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Row, Touchable, Txt } from './primitives';

export type ChipState = 'neutral' | 'selected';

export interface ChipProps {
  label: string;
  state: ChipState;
  onToggle?: () => void;
  disabled?: boolean;
  icon?: IconName;
}

const LOOK: Record<ChipState, { bg: ColorToken; border: ColorToken; text: ColorToken }> = {
  neutral: { bg: 'surface', border: 'line', text: 'ink' },
  selected: { bg: 'accent', border: 'accent', text: 'accentInk' },
};

const DISABLED_LOOK = { bg: 'surface2', border: 'line', text: 'ink2' } as const;

export function Chip(props: ChipProps): ReactElement {
  const look = props.disabled ? DISABLED_LOOK : LOOK[props.state];
  const selected = props.state === 'selected';
  const content = (
    <Row gap={2} align="center" justify="center" px={4} minH={48}>
      {props.icon ? <Icon name={props.icon} size={18} color={look.text} /> : null}
      <Txt variant="label" color={look.text}>
        {props.label}
      </Txt>
    </Row>
  );
  if (!props.onToggle) {
    return (
      <Box
        bg={look.bg}
        border={look.border}
        radius="pill"
        accessibilityLabel={props.label}
        selected={selected}
      >
        {content}
      </Box>
    );
  }
  return (
    <Touchable
      onPress={props.onToggle}
      disabled={props.disabled}
      selected={selected}
      accessibilityRole="togglebutton"
      accessibilityLabel={props.label}
      bg={look.bg}
      border={look.border}
      radius="pill"
      pressScale={0.95}
    >
      {content}
    </Touchable>
  );
}
