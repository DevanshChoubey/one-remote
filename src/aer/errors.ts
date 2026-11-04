// From aer-remote src/device/errors.ts (2026-11-04). Adapted: DeviceError renamed AerError, 'busy' added, aerProblem added.

/** Every failure the app explains to the user; screens map each one to copy through aerProblem. */
export const AER_ERROR_CODES = [
  'bluetoothOff',
  'permissionDenied',
  'unreachable',
  'noReply',
  'rejected',
  'batteryTooLow',
  'disconnected',
  'timeZone',
  'notDispenser',
  'busy',
] as const;

export type AerErrorCode = (typeof AER_ERROR_CODES)[number];

export class AerError extends Error {
  readonly code: AerErrorCode;

  constructor(code: AerErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AerError';
    this.code = code;
    Object.setPrototypeOf(this, AerError.prototype);
  }
}

export type AerProblem =
  | 'btoff'
  | 'denied'
  | 'away'
  | 'busy'
  | 'flat'
  | 'notAer'
  | 'scheduleRunning'
  | 'timeZone'
  | 'failed';

/** The one problem a screen words for an error from the dispenser. */
export function aerProblem(e: unknown): AerProblem {
  if (!(e instanceof AerError)) return 'failed';
  switch (e.code) {
    case 'bluetoothOff':
      return 'btoff';
    case 'permissionDenied':
      return 'denied';
    case 'unreachable':
    case 'noReply':
    case 'disconnected':
      return 'away';
    case 'busy':
      return 'busy';
    case 'batteryTooLow':
      return 'flat';
    case 'notDispenser':
      return 'notAer';
    case 'timeZone':
      return 'timeZone';
    case 'rejected':
      if (e.message === 'batteryTooLow') return 'flat';
      if (e.message === 'scheduleRunning') return 'scheduleRunning';
      return 'failed';
  }
}
