export type DeviceErrorCode =
  'notSent' | 'timeout' | 'notPaired' | 'noIrEmitter' | 'noLink' | 'notLocal' | 'unsupported';

/** A finer reason behind a code, for the cases a screen words differently. */
export type DeviceErrorDetail = 'noTextField';

export class DeviceError extends Error {
  readonly code: DeviceErrorCode;
  readonly detail?: DeviceErrorDetail;

  constructor(code: DeviceErrorCode, message?: string, detail?: DeviceErrorDetail) {
    super(message ?? code);
    this.name = 'DeviceError';
    this.code = code;
    this.detail = detail;
    Object.setPrototypeOf(this, DeviceError.prototype);
  }
}
