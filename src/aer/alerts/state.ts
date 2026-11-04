// From aer-remote src/alerts/state.ts (2026-11-04). Adapted: AsyncStorageLike from @/store/types, One Remote storage keys, one switch per group instead of enabled.
import type { AsyncStorageLike } from '@/store/types';
import type { AlertGroup, AlertSwitches } from './types';

/** When an alert was delivered, and which cycle it was for. */
export interface DeliveredAlert {
  /** ISO time the alert was delivered. */
  at: string;
  /**
   * The cycle the alert belongs to: the sprays since refill for a refill alert, 'set' for a
   * battery alert, the planned-from status time for a check-in.
   */
  cycle: string;
}

/** Delivered alerts, keyed by alert key. */
export type AlertState = Record<string, DeliveredAlert>;

export interface AlertStateStore {
  /** The saved state; {} when nothing valid is saved. */
  load(): Promise<AlertState>;
  save(s: AlertState): Promise<void>;
  /** One switch per group; all on when nothing valid is saved. */
  switches(): Promise<AlertSwitches>;
  setSwitch(group: AlertGroup, on: boolean): Promise<void>;
  /** True once the app has asked for notification permission on its own. */
  asked(): Promise<boolean>;
  setAsked(): Promise<void>;
}

const STATE_KEY = 'one-remote/aer-alerts/v1';
const SWITCHES_KEY = 'one-remote/aer-alerts/switches';
const ASKED_KEY = 'one-remote/aer-alerts/asked';

const ALL_ON: AlertSwitches = { refill: true, battery: true, checkIn: true };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function createAlertStateStore(storage: AsyncStorageLike): AlertStateStore {
  return {
    async load() {
      try {
        const raw = await storage.getItem(STATE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) ? (parsed as AlertState) : {};
      } catch (e) {
        // Corrupt data: start over rather than repeat or hide alerts forever.
        console.warn('Could not read the alert state', e);
        return {};
      }
    },
    save: (s) => storage.setItem(STATE_KEY, JSON.stringify(s)),
    async switches() {
      try {
        const raw = await storage.getItem(SWITCHES_KEY);
        if (raw === null) return { ...ALL_ON };
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) return { ...ALL_ON };
        // A group that is not saved as exactly false stays on.
        return {
          refill: parsed.refill !== false,
          battery: parsed.battery !== false,
          checkIn: parsed.checkIn !== false,
        };
      } catch (e) {
        console.warn('Could not read the alert switches', e);
        return { ...ALL_ON };
      }
    },
    async setSwitch(group, on) {
      const next = { ...(await this.switches()), [group]: on };
      await storage.setItem(SWITCHES_KEY, JSON.stringify(next));
    },
    async asked() {
      try {
        return (await storage.getItem(ASKED_KEY)) === 'true';
      } catch (e) {
        // Unreadable: the phone still limits how often the prompt shows, so asking again is safe.
        console.warn('Could not read whether the app asked for notifications', e);
        return false;
      }
    },
    setAsked: () => storage.setItem(ASKED_KEY, 'true'),
  };
}
