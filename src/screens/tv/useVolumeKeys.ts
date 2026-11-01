import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { TvKey } from '@/core';
import { useServices } from '@/services';
import { VolumeKeys } from '../../../modules/volume-keys';
import { usePreferences } from './usePreferences';

/**
 * On Android, while `active`, the phone's volume keys change the TV volume instead of the phone's.
 * Off when the preference is off, on iPhone, and when the native module is missing.
 */
export function useVolumeKeys(deviceId: string, active: boolean): void {
  const { hub } = useServices();
  const preferences = usePreferences();
  const wanted = preferences?.volumeKeys === true;
  const on = Platform.OS === 'android' && VolumeKeys !== null && wanted && active;

  useEffect(() => {
    if (!on || VolumeKeys === null) return;
    const module = VolumeKeys;
    const sub = module.addListener('onVolumeKey', (e) => {
      const key: TvKey = e.direction === 'up' ? 'volumeUp' : 'volumeDown';
      // The hub never resends a key; a failed press is simply dropped.
      hub.send(deviceId, { kind: 'tv.key', key }).catch(() => undefined);
    });
    module.setEnabled(true);
    return () => {
      sub.remove();
      module.setEnabled(false);
    };
  }, [on, hub, deviceId]);
}
