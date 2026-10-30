export type DeviceErrorCode =
  | 'notSent'
  | 'timeout'
  | 'notPaired'
  | 'noIrEmitter'
  | 'noLink'
  | 'notLocal'
  | 'unsupported'
  | 'partiallySent';

export class DeviceError extends Error {
  readonly code: DeviceErrorCode;

  constructor(code: DeviceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'DeviceError';
    this.code = code;
    Object.setPrototypeOf(this, DeviceError.prototype);
  }
}
