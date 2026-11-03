import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Box } from './primitives';

export interface StatusDotProps {
  tone: 'ok' | 'warn' | 'err';
  /** Blinks (1.4 s) while a link is being checked. */
  live?: boolean;
}

const TONE: Record<StatusDotProps['tone'], ColorToken> = { ok: 'ok', warn: 'warm', err: 'danger' };

export function StatusDot(props: StatusDotProps): ReactElement {
  return <Box w={8} h={8} radius="pill" bg={TONE[props.tone]} />;
}
