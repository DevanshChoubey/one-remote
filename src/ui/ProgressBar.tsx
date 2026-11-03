import type { ReactElement } from 'react';
import { Box } from './primitives';

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  label: string;
}

export function ProgressBar(props: ProgressBarProps): ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, props.value)) * 100);
  return (
    <Box
      h={8}
      bg="surface2"
      radius="pill"
      accessibilityLabel={props.label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <Box h={8} w={`${pct}%`} bg="accent" radius="pill" />
    </Box>
  );
}
