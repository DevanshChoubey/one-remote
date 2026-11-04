// From aer-remote src/protocol/status.ts (2026-11-04). Adapted: none.
import type { CborValue } from './cbor';
import type { Reply } from './replies';
import type { Interval } from './schedule';

export interface DeviceStatus {
  batteryMv: number;
  firmware: string;
  autoSpray: Interval | null;
  /** A schedule window is running; the dispenser stops auto-spray when one starts. */
  scheduleRunning: boolean;
  spraysSinceRefill: number;
}

export const REFILL_SPRAYS = 2200;

// `cS` 11x is auto-spray. 12x is a schedule window running, its last digit the schedule's interval.
const AUTO_SPRAY: Record<number, Interval> = { 112: 10, 113: 20, 114: 40 };
const SCHEDULE_RUNNING = new Set([121, 122, 123]);

function sumNumbers(v: CborValue | undefined): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.reduce((acc: number, x) => acc + sumNumbers(x), 0);
  if (typeof v === 'object' && v !== null && !(v instanceof Uint8Array)) {
    return Object.values(v).reduce((acc: number, x) => acc + sumNumbers(x), 0);
  }
  return 0;
}

export function parseStatus(r: Reply): DeviceStatus {
  const { bV, fV, cS, sC } = r.body;
  if (typeof bV !== 'number') throw new Error('status reply missing bV');
  return {
    batteryMv: bV,
    firmware: typeof fV === 'string' ? fV : '',
    autoSpray: typeof cS === 'number' ? (AUTO_SPRAY[cS] ?? null) : null,
    scheduleRunning: typeof cS === 'number' && SCHEDULE_RUNNING.has(cS),
    spraysSinceRefill: sumNumbers(sC),
  };
}

const clampPct = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

export const batteryPercent = (mv: number): number => clampPct(((mv - 2400) / (3100 - 2400)) * 100);

export const isBatteryTooLow = (mv: number): boolean => mv < 2400;

export const refillPercent = (spraysSinceRefill: number): number =>
  clampPct(100 - (spraysSinceRefill / REFILL_SPRAYS) * 100);
