import type { Device, Room, Unsubscribe } from '@/core';

/** `corrupt`: the stored home cannot be read. Reads reject and writes are refused, so it is never
 *  overwritten; nothing is lost while the data is looked at or repaired. */
export type StoreErrorCode = 'roomNotEmpty' | 'notFound' | 'corrupt';

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'StoreError';
    this.code = code;
    Object.setPrototypeOf(this, StoreError.prototype);
  }
}

export interface HomeStore {
  devices(): Promise<Device[]>;
  rooms(): Promise<Room[]>;
  /** Throws StoreError('notFound') if `d.roomId` is not a stored room. */
  upsertDevice(d: Device): Promise<void>;
  removeDevice(id: string): Promise<void>;
  upsertRoom(r: Room): Promise<void>;
  /** Throws StoreError('roomNotEmpty') if any device uses the room. */
  removeRoom(id: string): Promise<void>;
  /** Reorders within the device's room; `order` is renumbered 0..n. */
  moveDevice(id: string, toIndex: number): Promise<void>;
  /** Reorders rooms; `order` is renumbered 0..n. Throws StoreError('notFound') for an unknown id. */
  moveRoom(id: string, toIndex: number): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface SecretStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, v: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

export interface AsyncStorageLike {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem?(k: string): Promise<void>;
}

export interface HomeSnapshot {
  devices: Device[];
  rooms: Room[];
}
