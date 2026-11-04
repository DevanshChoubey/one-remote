// From aer-remote src/alerts/testing/fakeScheduler.ts (2026-11-04). Adapted: scheduler.ts types now live in ../types.
import type { AlertPermission, AlertScheduler, ScheduledAlert } from '../types';

export interface FakeScheduler extends AlertScheduler {
  scheduled: Map<string, ScheduledAlert>;
  setPermission(p: AlertPermission): void;
  /** What the next prompt answers. 'undetermined' models a refusal the phone may ask about again. */
  answer: AlertPermission;
  requestCount: number;
  tap(dispenserId: string): void;
}

/** In-memory scheduler. A prompt (while askable) answers `answer`, granted unless a test changes it. */
export function createFakeScheduler(now: () => Date): FakeScheduler {
  const scheduled = new Map<string, ScheduledAlert>();
  const listeners = new Set<(dispenserId: string) => void>();
  let current: AlertPermission = 'undetermined';
  const fake: FakeScheduler = {
    scheduled,
    requestCount: 0,
    answer: 'granted',
    setPermission(p) {
      current = p;
    },
    tap(dispenserId) {
      for (const cb of [...listeners]) cb(dispenserId);
    },
    async permission() {
      return current;
    },
    async requestPermission() {
      fake.requestCount += 1;
      if (current === 'undetermined') current = fake.answer;
      return current;
    },
    async pendingKeys() {
      return [...scheduled.keys()];
    },
    async schedule(a) {
      // A time that has passed fires now, so it is no longer pending.
      if (a.at.getTime() <= now().getTime()) scheduled.delete(a.key);
      else scheduled.set(a.key, a);
    },
    async cancel(key) {
      scheduled.delete(key);
    },
    async cancelAll() {
      scheduled.clear();
    },
    onOpen(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
  return fake;
}
