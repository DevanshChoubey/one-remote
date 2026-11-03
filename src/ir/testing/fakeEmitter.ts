import { DeviceError } from '@/core';
import type { IrEmitter, IrSignal } from '../emitter';

export function createFakeEmitter(opts?: {
  has?: boolean;
}): IrEmitter & { sent: IrSignal[]; failNext(): void } {
  const has = opts?.has ?? true;
  const sent: IrSignal[] = [];
  let fail = false;
  return {
    sent,
    hasEmitter: () => has,
    failNext(): void {
      fail = true;
    },
    async transmit(s: IrSignal): Promise<void> {
      if (!has) throw new DeviceError('noIrEmitter');
      if (fail) {
        fail = false;
        throw new DeviceError('notSent');
      }
      sent.push(s);
    },
  };
}
