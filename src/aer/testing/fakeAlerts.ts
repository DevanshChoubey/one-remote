import type { Alerts, AlertGroup, AlertPermission, AlertSwitches } from '../alerts/types';

export type FakeAlerts = Alerts & {
  /** Plays a tap on an alert. */
  opened(id: string | null): void;
  startCalls: number;
  stopCalls: number;
};

export function createFakeAlerts(
  opts: { permission?: AlertPermission; switches?: Partial<AlertSwitches> } = {},
): FakeAlerts {
  const switches: AlertSwitches = { refill: true, battery: true, checkIn: true, ...opts.switches };
  const openers = new Set<(deviceId: string | null) => void>();
  const fake: FakeAlerts = {
    startCalls: 0,
    stopCalls: 0,
    start() {
      fake.startCalls += 1;
      return () => {
        fake.stopCalls += 1;
      };
    },
    async sync() {},
    async switches() {
      return { ...switches };
    },
    async setSwitch(group: AlertGroup, on: boolean) {
      switches[group] = on;
    },
    async permission() {
      return opts.permission ?? 'granted';
    },
    async pendingKeys() {
      return [];
    },
    onOpen(cb) {
      openers.add(cb);
      return () => {
        openers.delete(cb);
      };
    },
    opened(id) {
      for (const cb of [...openers]) cb(id);
    },
  };
  return fake;
}
