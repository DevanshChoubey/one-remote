import type { ReactElement, ReactNode } from 'react';

export interface RiseProps {
  /** Position in a staggered list. */
  index?: number;
  children: ReactNode;
}

/** Content that rises into place on entry (the motion is added on top of this plain body). */
export function Rise(props: RiseProps): ReactElement {
  return <>{props.children}</>;
}
