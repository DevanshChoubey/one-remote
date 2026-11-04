// From aer-remote src/alerts/scheduler.ts (2026-11-04). Adapted: AlertGroup, AlertSwitches and the Alerts interface added.

export type AlertGroup = 'refill' | 'battery' | 'checkIn';
export type AlertSwitches = Record<AlertGroup, boolean>;

/** 'undetermined' means the app may still ask; 'denied' means the phone will not show the prompt. */
export type AlertPermission = 'granted' | 'denied' | 'undetermined';

export interface ScheduledAlert {
  key: string;
  dispenserId: string;
  at: Date;
  title: string;
  body: string;
}

export interface AlertScheduler {
  permission(): Promise<AlertPermission>;
  requestPermission(): Promise<AlertPermission>;
  /** Only this app's alert keys. */
  pendingKeys(): Promise<string[]>;
  /** Replaces any pending alert with the same key. */
  schedule(a: ScheduledAlert): Promise<void>;
  cancel(key: string): Promise<void>;
  cancelAll(): Promise<void>;
  /** Calls back with the dispenser id when the user taps an alert; returns unsubscribe. */
  onOpen(cb: (dispenserId: string) => void): () => void;
}

export interface Alerts {
  start(): () => void;
  sync(opts: { mayAsk: boolean }): Promise<void>;
  switches(): Promise<AlertSwitches>;
  setSwitch(group: AlertGroup, on: boolean): Promise<void>;
  permission(): Promise<AlertPermission>;
  pendingKeys(): Promise<string[]>;
  /** The tapped alert's device id, or null when that device is gone. */
  onOpen(cb: (deviceId: string | null) => void): () => void;
}
