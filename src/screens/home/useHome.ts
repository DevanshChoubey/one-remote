import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { defaultAcState, defaultFanState } from '@/core';
import type { AcState, Device, FanState, Room } from '@/core';
import { StoreError, useServices } from '@/services';
import type { DeviceView, ViewState } from '@/services';

export interface HomeCard {
  view: DeviceView;
  /** An IR-only device on a phone without an IR emitter. */
  needsIr: boolean;
  /** What the power switch shows: the last command, else the reported state. */
  power: boolean;
  /** The switch can act: false for a TV that is off and cannot be woken from this phone. */
  canPower: boolean;
}

export interface HomeSection {
  room: Room;
  cards: HomeCard[];
}

export interface HomeModel {
  loaded: boolean;
  /** The stored home is damaged: Home shows an error, not the welcome, and the store refuses writes. */
  corrupt: boolean;
  sections: HomeSection[];
  /** Cards on screen. */
  deviceCount: number;
  showNoIrBanner: boolean;
  togglePower(id: string): void;
}

/** What a device was last told, and the hub state it was told against. A TV keeps only its power. */
interface Told {
  power: boolean;
  state?: AcState | FanState;
  base: ViewState | undefined;
}

function reportedPower(state: ViewState | undefined): boolean {
  return state ? state.state.power : false;
}

export function useHome(): HomeModel {
  const { hub, store } = useServices();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [storeCount, setStoreCount] = useState<number | null>(null);
  const [corrupt, setCorrupt] = useState(false);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // So a quick second tap flips from the last command, not from a state that has not caught up.
  const told = useRef(new Map<string, Told>());
  // The same map as a render-safe snapshot; `commit` publishes the ref's current content.
  const [toldNow, setToldNow] = useState<ReadonlyMap<string, Told>>(new Map());
  // Sends not yet settled per device: while any is in flight, state changes cannot clear `told`.
  const inflight = useRef(new Map<string, number>());
  const commit = useCallback((): void => setToldNow(new Map(told.current)), []);

  // Rooms (and the number of stored devices) come from the store; latest read wins.
  useEffect(() => {
    let alive = true;
    let latest = 0;
    let applied = 0;
    const load = (): void => {
      const mine = ++latest;
      Promise.all([store.rooms(), store.devices()]).then(
        ([r, d]) => {
          if (!alive || mine < applied) return;
          applied = mine;
          setCorrupt(false);
          setRooms(r);
          setStoreCount(d.length);
        },
        (e: unknown) => {
          console.error('Could not load the home', e);
          if (!alive) return;
          setCorrupt(e instanceof StoreError && e.code === 'corrupt');
          // Show what the hub has rather than staying blank.
          setRooms((prev) => prev ?? []);
          setStoreCount(hub.devicesKnown().length);
        },
      );
    };
    load();
    const stop = store.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [hub, store]);

  // The hub owns the device set; re-render whenever it changes.
  useEffect(() => {
    const stop = hub.onDevicesChanged(bump);
    bump(); // It may have changed between the render and this effect.
    return stop;
  }, [hub]);

  const devices = hub.devicesKnown();
  const ids = devices.map((d) => d.id).join('|');
  useEffect(() => {
    const stops = ids
      .split('|')
      .filter((id) => id !== '')
      .flatMap((id) => {
        try {
          return [
            hub.subscribe(id, (v) => {
              const t = told.current.get(id);
              if (t && (inflight.current.get(id) ?? 0) === 0 && v.state !== t.base) {
                told.current.delete(id); // Idle, and the hub learned something new.
              }
              commit();
              bump();
            }),
          ];
        } catch {
          return [];
        }
      });
    return () => stops.forEach((stop) => stop());
  }, [hub, ids, commit]);

  // Counts a power send in flight and settles `told` once the device is idle again.
  const track = useCallback(
    (id: string, entry: Told, sent: Promise<unknown>): void => {
      inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1);
      const settle = (): void => {
        const left = (inflight.current.get(id) ?? 1) - 1;
        if (left > 0) {
          inflight.current.set(id, left);
          return;
        }
        inflight.current.delete(id);
        // Idle again: drop the entry if the hub's state moved on while we were busy.
        const now = told.current.get(id);
        if (now) {
          try {
            if (hub.view(id).state !== now.base) told.current.delete(id);
          } catch {
            told.current.delete(id);
          }
        }
        commit();
      };
      sent.then(settle, (e: unknown) => {
        console.error('Power toggle failed', e);
        if (told.current.get(id) === entry) told.current.delete(id);
        settle();
      });
    },
    [hub, commit],
  );

  const togglePower = useCallback(
    (id: string): void => {
      let view: DeviceView;
      try {
        view = hub.view(id);
      } catch {
        return; // The device was removed under the tap.
      }
      const kind = view.device.kind;
      const reported = view.state;
      const before = told.current.get(id);
      if (kind === 'tv') {
        // On: the TV's power key. Off or not heard from: wake it, as the TV screen's Turn on does.
        const wasOn = before ? before.power : reportedPower(reported);
        if (!wasOn && view.capabilities.tv?.powerOn === false) return;
        const entry: Told = { power: !wasOn, base: reported };
        told.current.set(id, entry);
        commit();
        track(
          id,
          entry,
          hub.send(id, wasOn ? { kind: 'tv.key', key: 'power' } : { kind: 'tv.powerOn' }),
        );
        return;
      }
      const prior = before?.state;
      const last =
        prior ??
        (kind === 'ac'
          ? reported?.kind === 'ac'
            ? reported.state
            : defaultAcState()
          : reported?.kind === 'fan'
            ? reported.state
            : defaultFanState());
      const next = { ...last, power: !last.power };
      const entry: Told = { power: next.power, state: next, base: reported };
      told.current.set(id, entry);
      commit();
      const sent =
        kind === 'ac'
          ? hub.send(id, { kind: 'ac.set', state: { ...defaultAcState(), ...next } })
          : hub.send(id, { kind: 'fan.set', state: { ...defaultFanState(), ...next } });
      track(id, entry, sent);
    },
    [hub, commit, track],
  );

  const sorted = [...(rooms ?? [])].sort((a, b) => a.order - b.order);
  const sections: HomeSection[] = sorted.flatMap((room) => {
    const cards = devices
      .filter((d: Device) => d.roomId === room.id)
      .sort((a, b) => a.order - b.order)
      .map((d): HomeCard => {
        const view = hub.view(d.id);
        const needsIr = !view.usable && d.links.length > 0 && d.links.every((l) => l.kind === 'ir');
        const t = toldNow.get(d.id);
        const power = t ? t.power : reportedPower(view.state);
        const canPower =
          view.usable && (d.kind !== 'tv' || power || view.capabilities.tv?.powerOn !== false);
        return { view, needsIr, power, canPower };
      });
    return cards.length > 0 ? [{ room, cards }] : [];
  });

  return {
    // Not loaded until the hub has caught up with the store, so Home never flashes the welcome.
    loaded: rooms !== null && storeCount === devices.length,
    corrupt,
    sections,
    deviceCount: sections.reduce((n, s) => n + s.cards.length, 0),
    showNoIrBanner: sections.some((s) => s.cards.some((c) => c.needsIr)),
    togglePower,
  };
}
