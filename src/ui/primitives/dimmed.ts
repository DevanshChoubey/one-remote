import { createContext, useContext } from 'react';
import type { BoxProps } from './Box';

/** True inside a dimmed (translucent) Touchable. */
export const DimmedContext = createContext(false);

/**
 * The props without a round box's shadow when it sits in a dimmed Touchable. Android draws an
 * elevation shadow under a translucent parent as a polygon, an octagon round a dimmed disc (a
 * disabled AC stepper, a disabled toggle's thumb); at the mock's 0.42 it is barely visible anyway.
 * Rectangular shadows draw fine, so cards keep theirs.
 */
export function useShadowless<P extends BoxProps>(props: P): P {
  const dimmed = useContext(DimmedContext);
  return dimmed && props.shadow && props.radius === 'pill'
    ? { ...props, shadow: undefined }
    : props;
}
