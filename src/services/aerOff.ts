import { AerError } from '@/aer/errors';
import type { Alerts } from '@/aer/alerts/types';
import type { AerService } from '@/aer/types';

/**
 * The placeholder until the real Bluetooth service and alerts are wired in: the air freshener
 * reports itself as unsupported, every operation rejects with 'bluetoothOff', alerts do nothing.
 */
export function createAerOff(): { aer: AerService; aerAlerts: Alerts } {
  const off = (): Promise<never> => Promise.reject(new AerError('bluetoothOff'));
  const aer: AerService = {
    supported: () => false,
    view: (deviceId) => ({ deviceId }),
    subscribe: () => () => {},
    scan: () => ({ stop: () => {}, done: off() }),
    blink: off,
    add: off,
    refresh: off,
    sprayNow: off,
    setAutoSpray: off,
    resetRefill: off,
    saveSchedules: off,
    setTimeZone: off,
    forget: off,
    closeAll: off,
  };
  const aerAlerts: Alerts = {
    start: () => () => {},
    sync: async () => {},
    switches: async () => ({ refill: false, battery: false, checkIn: false }),
    setSwitch: async () => {},
    permission: async () => 'undetermined',
    pendingKeys: async () => [],
    onOpen: () => () => {},
  };
  return { aer, aerAlerts };
}
