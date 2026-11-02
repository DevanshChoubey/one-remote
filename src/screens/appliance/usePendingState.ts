import { useRef, useState } from 'react';

/**
 * Optimistic state for an appliance that takes one full state per press. Each press builds on the
 * latest intended state (not the last confirmed one), so quick taps add up. While any send is in
 * flight the dial shows the intended state; when the queue drains, or a send fails, it goes back
 * to what the hub holds.
 */
export function usePendingState<S>(
  shown: S,
  submit: (next: S) => Promise<unknown>,
  onError: (e: unknown) => void,
): { state: S; press: (build: (base: S) => S) => void } {
  const target = useRef<S | null>(null);
  const inflight = useRef(0);
  const [guess, setGuess] = useState<S | null>(null);

  const press = (build: (base: S) => S): void => {
    const next = build(target.current ?? shown);
    target.current = next;
    inflight.current += 1;
    setGuess(next);
    submit(next)
      .catch((e: unknown) => {
        target.current = null;
        setGuess(null);
        onError(e);
      })
      .finally(() => {
        inflight.current -= 1;
        if (inflight.current === 0) {
          target.current = null;
          setGuess(null);
        }
      });
  };
  return { state: guess ?? shown, press };
}
