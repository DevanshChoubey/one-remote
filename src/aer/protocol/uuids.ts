// From aer-remote src/protocol/uuids.ts (2026-11-04). Adapted: Channels is now an alias of AerChannels from @/core.
import type { AerChannels } from '@/core';

export type Channels = AerChannels;

export const SERVICE_UUID = '6e400000-b5a3-f393-e0a9-e50e24dcca9e';

export const charUuid = (suffix: '0001' | '0002' | '0003' | '0004'): string =>
  `6e40${suffix}-b5a3-f393-e0a9-e50e24dcca9e`;

export const DEFAULT_CHANNELS: Channels = {
  reply: charUuid('0001'),
  command: charUuid('0003'),
  schedule: charUuid('0004'),
};
