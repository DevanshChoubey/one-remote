import { useEffect, useReducer } from 'react';
import type { DeviceView } from '@/services';
import { useServices } from '@/services';
import { useKnownDevice } from '../device/useKnownDevice';
import { useHomeData } from '../shared/useHomeData';

export type DeviceViewState =
  | { state: 'loading' }
  | { state: 'gone' }
  | { state: 'failed'; retry: () => void }
  | { state: 'ready'; view: DeviceView };

/**
 * The hub's view of a device, kept live. `loading` until the stored devices have been read and
 * handed to the hub; `gone` once the device is really not there (removed, or a stale link); `failed` when the store
 * could not be read, so we cannot tell.
 */
export function useDeviceView(deviceId: string): DeviceViewState {
  const { hub } = useServices();
  const known = useKnownDevice(deviceId) !== undefined;
  const home = useHomeData();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!known) return undefined;
    try {
      return hub.subscribe(deviceId, bump);
    } catch (e) {
      console.error('Could not watch the device', e);
      return undefined;
    }
  }, [hub, deviceId, known]);
  if (!known) {
    // The store may have it before the hub does.
    // A failed read says nothing about the device: show the error, never "gone".
    if (home.failed) return { state: 'failed', retry: home.reload };
    const stored = home.devices.some((d) => d.id === deviceId);
    return !home.loaded || stored ? { state: 'loading' } : { state: 'gone' };
  }
  try {
    return { state: 'ready', view: hub.view(deviceId) };
  } catch {
    return { state: 'gone' };
  }
}
