import { DeviceError } from '@/core';

/** The i18n key for a failed send. `ns` is the screen's own namespace ('ac' or 'fan'). */
export function sendErrorKey(e: unknown, ns: 'ac' | 'fan'): string {
  const code = e instanceof DeviceError ? e.code : 'notSent';
  switch (code) {
    case 'noIrEmitter':
      return `${ns}.error.needsIr`;
    case 'timeout':
      return `${ns}.error.timeout`;
    case 'partiallySent':
      return `${ns}.error.partial`;
    default:
      return `${ns}.error.notSent`;
  }
}
