import { requireOptionalNativeModule } from 'expo';

export type VolumeDirection = 'up' | 'down';

export interface VolumeKeysModule {
  /** While on, the volume keys go to the app and the system volume does not change. */
  setEnabled(on: boolean): void;
  addListener(
    event: 'onVolumeKey',
    cb: (e: { direction: VolumeDirection }) => void,
  ): { remove(): void };
}

/** Android only: `null` on iOS and in Jest, where there is no native module. */
export const VolumeKeys: VolumeKeysModule | null =
  requireOptionalNativeModule<VolumeKeysModule>('VolumeKeys');
