// From aer-remote src/alerts/index.ts (2026-11-04). Adapted: scheduler.ts types now live in ./types; groupOf and the switch types added.
export { createAlerts } from './engine';
export type { AlertsDeps } from './engine';
export { createAlertStateStore } from './state';
export type { AlertState, AlertStateStore, DeliveredAlert } from './state';
export type {
  AlertGroup,
  AlertPermission,
  AlertScheduler,
  Alerts,
  AlertSwitches,
  ScheduledAlert,
} from './types';
export { alertKey, groupOf } from './plan';
export type { AlertKind } from './plan';
