import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Box, Txt } from './primitives';

export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'ok' | 'accent';
}

const LOOK: Record<
  NonNullable<BadgeProps['tone']>,
  { bg: ColorToken; border?: ColorToken; text: ColorToken }
> = {
  neutral: { bg: 'surface2', border: 'line', text: 'ink2' },
  ok: { bg: 'okSoft', text: 'okInk' },
  accent: { bg: 'accentSoft', text: 'ink' },
};

export function Badge(props: BadgeProps): ReactElement {
  const look = LOOK[props.tone ?? 'neutral'];
  return (
    <Box bg={look.bg} border={look.border} radius="pill" px={3} py={1}>
      <Txt variant="caption" color={look.text}>
        {props.label}
      </Txt>
    </Box>
  );
}
