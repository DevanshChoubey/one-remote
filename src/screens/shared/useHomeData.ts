import { useEffect, useState } from 'react';
import type { Device, Room } from '@/core';
import { useServices } from '@/services';

export interface HomeData {
  loaded: boolean;
  rooms: Room[];
  devices: Device[];
}

/** The stored rooms and devices, kept live; the latest read wins. */
export function useHomeData(): HomeData {
  const { store } = useServices();
  const [data, setData] = useState<HomeData>({ loaded: false, rooms: [], devices: [] });
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
            rooms: [...rooms].sort((a, b) => a.order - b.order),
            devices,
          });
        },
        (e: unknown) => {
          console.error('Could not load the home', e);
          if (alive) setData((d) => ({ ...d, loaded: true }));
        },
      );
    };
    load();
    const stop = store.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [store]);
  return data;
}
