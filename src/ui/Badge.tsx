import type { ReactElement } from 'react';
import Animated from 'react-native-reanimated';
import type { ColorToken } from '@/theme';
import { useTheme } from '@/theme';
import { Txt } from './primitives';

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

/** A small pill: 10 px across, 3 px down (the mock's badge). */
export function Badge(props: BadgeProps): ReactElement {
  const theme = useTheme();
  const look = LOOK[props.tone ?? 'neutral'];
  return (
    <Animated.View
      style={{
        backgroundColor: theme.color[look.bg],
        borderRadius: theme.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
        ...(look.border ? { borderWidth: 1, borderColor: theme.color[look.border] } : null),
      }}
    >
      <Txt variant="caption" color={look.text}>
        {props.label}
      </Txt>
    </Animated.View>
  );
}
