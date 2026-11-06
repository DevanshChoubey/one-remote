import { useEffect, useState } from 'react';
import type { LastSent } from '@/services';
import { useServices } from '@/services';

/**
 * The last state sent to an IR appliance, kept across restarts (IR cannot report state). Returns
 * it once loaded, and a `save` to call after a send. The IR driver is told too, so its memory
 * (a fan's key-by-key state, an AC's toggles) matches the screen.
 */
export function useLastSent(
  deviceId: string,
  enabled: boolean,
  /** The hub already holds a state: it is newer than the saved one, so nothing is seeded. */
  hubHasState: boolean,
): { stored: LastSent | undefined; save: (entry: LastSent) => void } {
  const { prefs, ir } = useServices();
  const [stored, setStored] = useState<LastSent | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    prefs.get().then(
      (p) => {
        const entry = p.lastSent[deviceId];
        if (!alive || !entry) return;
        setStored(entry);
        if (hubHasState) return;
        if (entry.kind === 'fan') ir.seedFan(deviceId, entry.state);
        else ir.seedAc(deviceId, entry.state);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [prefs, ir, deviceId, enabled, hubHasState]);

  const save = (entry: LastSent): void => {
    if (!enabled) return;
    prefs
      .get()
      .then((p) => prefs.set({ lastSent: { ...p.lastSent, [deviceId]: entry } }))
      .catch((e: unknown) => console.error('Could not remember the last state', e));
  };
  return { stored, save };
}
