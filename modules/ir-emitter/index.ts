import { requireOptionalNativeModule } from 'expo-modules-core';

export interface IrEmitterNative {
  hasIrEmitter(): boolean;
  transmit(freqHz: number, pattern: number[]): Promise<void>;
}

/** `null` on iOS and in Jest, where the native module does not exist. */
export const IrEmitterModule: IrEmitterNative | null =
  requireOptionalNativeModule<IrEmitterNative>('IrEmitter');
