import type { GreeSetup } from '@/core';
import type { GreeClient } from './client';

/** How long a scan listens for answers. */
export const SCAN_MS = 3000;

export function createGreeSetup(o: {
  client: GreeClient;
  enabled?: boolean;
  scanMs?: number;
}): GreeSetup {
  return {
    available: () => o.enabled ?? true,
    scan: () => o.client.scan(o.scanMs ?? SCAN_MS),
    async bind(unit) {
      const { key, cipher } = await o.client.bind(unit);
      return { kind: 'gree', mac: unit.mac, host: unit.host, key, cipher };
    },
  };
}
