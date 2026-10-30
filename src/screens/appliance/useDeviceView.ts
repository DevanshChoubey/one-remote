import { useEffect, useReducer } from 'react';
import type { DeviceView } from '@/services';
import { useServices } from '@/services';
import { useKnownDevice } from '../device/useKnownDevice';

/** The hub's view of a device, kept live; undefined while the hub does not know it. */
export function useDeviceView(deviceId: string): DeviceView | undefined {
  const { hub } = useServices();
  const known = useKnownDevice(deviceId) !== undefined;
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
  if (!known) return undefined;
  try {
    return hub.view(deviceId);
  } catch {
    return undefined;
  }
}
