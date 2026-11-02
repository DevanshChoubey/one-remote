import { requireOptionalNativeModule } from 'expo-modules-core';

export interface MulticastLockNative {
  /** Lets this phone receive Wi-Fi multicast (mDNS). Safe to call twice. */
  acquire(): void;
  release(): void;
}

/** `null` on iOS and in Jest, where the native module does not exist. */
export const MulticastLockModule: MulticastLockNative | null =
  requireOptionalNativeModule<MulticastLockNative>('MulticastLock');
