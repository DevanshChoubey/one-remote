import { useEffect, useState } from 'react';
import type { Preferences } from '@/services';
import { useServices } from '@/services';

/** The preferences, kept live. `null` until the first read. */
export function usePreferences(): Preferences | null {
  const { prefs } = useServices();
  const [value, setValue] = useState<Preferences | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      prefs.get().then(
        (p) => {
          if (alive) setValue(p);
        },
        (e: unknown) => console.error('Could not read preferences', e),
      );
    };
    load();
    const stop = prefs.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [prefs]);
  return value;
}
