// The contracts the aer lanes build against. SavedDispenser and DispenserStore come from aer-remote
// src/store/types.ts (2026-11-04). Adapted: SavedDispenser is keyed by the One Remote device id and
// carries the Bluetooth id as bleId.
import type { AerChannels, Device, Unsubscribe } from '@/core';
import type { DeviceStatus, Interval, Schedule } from './protocol';

export interface SavedDispenser {
  id: string;
  bleId: string;
  name: string;
  homeTimeZone: string;
  channels?: AerChannels;
  clockSet?: boolean;
  lastStatus?: DeviceStatus & { at: string };
  schedules?: { list: Schedule[]; at: string };
}

export interface DispenserStore {
  list(): Promise<SavedDispenser[]>;
  get(id: string): Promise<SavedDispenser | null>;
  upsert(d: SavedDispenser): Promise<void>;
  remove(id: string): Promise<void>;
  subscribe(cb: () => void): () => void;
}

/** What the app last read from one dispenser. Only `deviceId` is set before the first read. */
export interface AerView {
  deviceId: string;
  status?: DeviceStatus & { at: string };
  schedules?: { list: Schedule[]; at: string };
  clockSet?: boolean;
}

export interface FoundAer {
  bleId: string;
  name: string | null;
  rssi: number | null;
}

export interface AerService {
  /** false on Android below 12 (API 31). */
  supported(): boolean;
  /** The cached reading, synchronously ({ deviceId } before the first read). Returns the same object until the reading changes. */
  view(deviceId: string): AerView;
  subscribe(deviceId: string, cb: (v: AerView) => void): Unsubscribe;
  /** Lists nearby devices, first found first, once each, without those already added. */
  scan(onFound: (d: FoundAer) => void, timeoutMs: number): { stop(): void; done: Promise<void> };
  /** For a dispenser not added yet pass `target`; the session is keyed by the future device id. */
  blink(deviceId: string, target?: { bleId: string; timeZone: string }): Promise<void>;
  /** The device's room must already exist in the home store. Connects, sets the clock, reads, and only then writes `device` (kind 'aer', one aer link) to the home store. */
  add(device: Device): Promise<void>;
  refresh(deviceId: string): Promise<AerView>;
  sprayNow(deviceId: string): Promise<DeviceStatus>;
  setAutoSpray(deviceId: string, interval: Interval | null): Promise<DeviceStatus>;
  resetRefill(deviceId: string): Promise<DeviceStatus>;
  /** Replace-all save, then read-back; resolves with what the dispenser holds. */
  saveSchedules(deviceId: string, list: Schedule[]): Promise<Schedule[]>;
  setTimeZone(deviceId: string, zone: string): Promise<void>;
  /** Closes its session and drops its cache (the home store removal is the caller's). */
  forget(deviceId: string): Promise<void>;
  closeAll(): Promise<void>;
}
