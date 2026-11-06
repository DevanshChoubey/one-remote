import { useRef, useState } from 'react';

/**
 * Optimistic state for an appliance that takes one full state per press. Each press builds on the
 * latest intended state (not the last confirmed one), so quick taps add up. While any send is in
 * flight the dial shows the intended state; when the queue drains it goes back to what the hub
 * holds.
 *
 * A failed send drops only its own state. The intended state is then the newest press that has not
 * failed (a full state, so it carries every earlier change of the burst), and the next tap builds
 * on what will really land, not on the hub's older state.
 */
export function usePendingState<S>(
  shown: S,
  submit: (next: S) => Promise<unknown>,
  onError: (e: unknown) => void,
): { state: S; press: (build: (base: S) => S) => void } {
  // The presses of this burst that have not failed, oldest first. A box each, so equal states differ.
  const presses = useRef<{ state: S }[]>([]);
  const inflight = useRef(0);
  const [guess, setGuess] = useState<{ state: S } | null>(null);
  const newest = (): { state: S } | null => presses.current[presses.current.length - 1] ?? null;

  const press = (build: (base: S) => S): void => {
    const entry = { state: build(newest()?.state ?? shown) };
    presses.current = [...presses.current, entry];
    inflight.current += 1;
    setGuess(entry);
    submit(entry.state)
      .catch((e: unknown) => {
        presses.current = presses.current.filter((p) => p !== entry);
        onError(e);
      })
      .finally(() => {
        inflight.current -= 1;
        // Nothing in flight: the hub's state is the truth again.
        if (inflight.current === 0) presses.current = [];
        setGuess(newest());
      });
  };
  return { state: guess?.state ?? shown, press };
}
