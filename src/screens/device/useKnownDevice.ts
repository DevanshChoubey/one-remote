import { useEffect, useReducer } from 'react';
import type { Device } from '@/core';
import { useServices } from '@/services';

/** The device as the hub knows it, kept live; undefined until the hub has it (or once removed). */
export function useKnownDevice(id: string): Device | undefined {
  const { hub } = useServices();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const stop = hub.onDevicesChanged(bump);
    bump(); // It may have changed between the render and this effect.
    return stop;
  }, [hub]);
  return hub.devicesKnown().find((d) => d.id === id);
}
