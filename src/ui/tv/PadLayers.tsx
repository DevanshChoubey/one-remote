import type { ReactElement, ReactNode } from 'react';
import { AnimatedBox } from '@/ui/primitives';

const FILL = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  overflow: 'hidden',
} as const;

/** A clipped, touch-transparent layer over the pad: the dot grid, the finger dot and the ripple. */
export function PadLayers(props: { children: ReactNode }): ReactElement {
  return (
    <AnimatedBox radius="lg" pointerEvents="none" animatedStyle={FILL}>
      {props.children}
    </AnimatedBox>
  );
}
