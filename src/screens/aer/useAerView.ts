import { useEffect, useReducer } from 'react';
import { useServices } from '@/services';
import type { AerView } from '@/services';

/** The cached reading of one air freshener; re-renders whenever the service reads or writes it. */
export function useAerView(deviceId: string): AerView {
  const { aer } = useServices();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => aer.subscribe(deviceId, rerender), [aer, deviceId]);
  return aer.view(deviceId);
}
