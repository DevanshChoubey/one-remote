import { DeviceError } from '@/core';
import type { IrEmitter, IrSignal } from '@/ir/emitter';
import { IrEmitterModule } from '../../modules/ir-emitter';

const MAX_TOTAL_US = 2_000_000;

export function createNativeIrEmitter(): IrEmitter {
  return {
    hasEmitter(): boolean {
      try {
        return IrEmitterModule?.hasIrEmitter() === true;
      } catch {
        return false;
      }
    },
    async transmit(s: IrSignal): Promise<void> {
      if (!IrEmitterModule || !IrEmitterModule.hasIrEmitter()) throw new DeviceError('noIrEmitter');
      const total = s.pattern.reduce((a, b) => a + b, 0);
      if (s.pattern.length === 0 || s.pattern.length % 2 !== 0 || total > MAX_TOTAL_US) {
        throw new DeviceError('unsupported');
      }
      try {
        await IrEmitterModule.transmit(s.freqHz, s.pattern);
      } catch {
        throw new DeviceError('notSent');
      }
    },
  };
}
