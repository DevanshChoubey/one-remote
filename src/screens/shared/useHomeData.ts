import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device, Room } from '@/core';
import { useServices } from '@/services';

export interface HomeData {
  loaded: boolean;
  /** The last read of the store failed; `devices` and `rooms` are then whatever was read before. */
  failed: boolean;
  /** Reads the store again (for a retry button). */
  reload: () => void;
  rooms: Room[];
  devices: Device[];
}

/** The stored rooms and devices, kept live; the latest read wins. */
export function useHomeData(): HomeData {
  const { store } = useServices();
  const [data, setData] = useState<Omit<HomeData, 'reload'>>({
    loaded: false,
    failed: false,
    rooms: [],
    devices: [],
  });
  const loader = useRef<() => void>(() => undefined);
  const reload = useCallback((): void => loader.current(), []);
  useEffect(() => {
    let alive = true;
    let issued = 0;
    let applied = 0;
    const load = (): void => {
      const mine = ++issued;
      Promise.all([store.rooms(), store.devices()]).then(
        ([rooms, devices]) => {
          if (!alive || mine < applied) return;
          applied = mine;
          setData({
            loaded: true,
            failed: false,
            rooms: [...rooms].sort((a, b) => a.order - b.order),
            devices,
          });
        },
        (e: unknown) => {
          console.error('Could not load the home', e);
          if (alive) setData((d) => ({ ...d, loaded: true, failed: true }));
        },
      );
    };
    loader.current = load;
    load();
    const stop = store.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [store]);
  return { ...data, reload };
}
