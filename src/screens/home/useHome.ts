import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { defaultAcState } from '@/core';
import type { AcState, Device, Room } from '@/core';
import { useServices } from '@/services';
import type { DeviceView } from '@/services';

export interface HomeCard {
  view: DeviceView;
  /** An IR-only device on a phone without an IR emitter. */
  needsIr: boolean;
}

export interface HomeSection {
  room: Room;
  cards: HomeCard[];
}

export interface HomeModel {
  loaded: boolean;
  sections: HomeSection[];
  deviceCount: number;
  showNoIrBanner: boolean;
  togglePower(id: string): void;
}

const MAX_HUB_WAITS = 5;

function viewOf(
  hub: ReturnType<typeof useServices>['hub'],
  device: Device,
): DeviceView | undefined {
  try {
    return hub.view(device.id);
  } catch {
    return undefined; // The hub has not caught up with the store yet.
  }
}

export function useHome(): HomeModel {
  const { hub, store } = useServices();
  const [data, setData] = useState<{ devices: Device[]; rooms: Room[] } | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // What each AC was last told, so a quick second tap flips from it, not from a stale view.
  const told = useRef(new Map<string, AcState>());

  useEffect(() => {
    let alive = true;
    let waits = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (): void => {
      Promise.all([store.devices(), store.rooms()]).then(
        ([devices, rooms]) => {
          if (!alive) return;
          setData({ devices, rooms });
          // The hub syncs from the same store; look again shortly if it is a step behind.
          if (devices.some((d) => !viewOf(hub, d)) && waits++ < MAX_HUB_WAITS) {
            timer = setTimeout(load, 0);
          }
        },
        (e: unknown) => console.error('Could not load the home', e),
      );
    };
    load();
    const stop = store.subscribe(() => {
      waits = 0;
      load();
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [hub, store]);

  const ids = data?.devices.map((d) => d.id).join('|') ?? '';
  useEffect(() => {
    const stops = (data?.devices ?? []).flatMap((d) => {
      try {
        return [
          hub.subscribe(d.id, (v) => {
            if (v.state) told.current.delete(d.id); // The hub now knows the real or last-sent state.
            bump();
          }),
        ];
      } catch {
        return [];
      }
    });
    return () => stops.forEach((stop) => stop());
    // `ids` is the identity of the device set; `data` itself changes on every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, ids]);

  const togglePower = useCallback(
    (id: string): void => {
      const view = hub.view(id);
      if (view.device.kind !== 'ac') return;
      const last =
        told.current.get(id) ?? (view.state?.kind === 'ac' ? view.state.state : defaultAcState());
      const next = { ...last, power: !last.power };
      told.current.set(id, next);
      hub.send(id, { kind: 'ac.set', state: next }).catch((e: unknown) => {
        console.error('Power toggle failed', e);
        told.current.delete(id);
        bump();
      });
    },
    [hub],
  );

  const rooms = [...(data?.rooms ?? [])].sort((a, b) => a.order - b.order);
  const sections: HomeSection[] = rooms.flatMap((room) => {
    const cards = (data?.devices ?? [])
      .filter((d) => d.roomId === room.id)
      .sort((a, b) => a.order - b.order)
      .flatMap((d) => {
        const view = viewOf(hub, d);
        if (!view) return [];
        const needsIr = !view.usable && d.links.length > 0 && d.links.every((l) => l.kind === 'ir');
        return [{ view, needsIr }];
      });
    return cards.length > 0 ? [{ room, cards }] : [];
  });

  return {
    loaded: data !== null,
    sections,
    deviceCount: data?.devices.length ?? 0,
    showNoIrBanner: sections.some((s) => s.cards.some((c) => c.needsIr)),
    togglePower,
  };
}
