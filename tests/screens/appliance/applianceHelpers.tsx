import type { Capabilities, Command, Device, LinkDriver } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import type { FakeDriver } from '@/device/testing/fakeDriver';
import type { Services } from '@/services';
import { device, makeServices, room } from '../helpers';

export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** An IR-like driver that cannot report state, so the hub remembers what was sent. */
export function silentDriver(
  kind: 'ir' | 'matter',
  opts: { capabilities?: Capabilities; available?: boolean } = {},
): { driver: LinkDriver; fake: FakeDriver } {
  const fake = createFakeDriver(kind, opts);
  const driver: LinkDriver = {
    kind: fake.kind,
    available: fake.available,
    supports: fake.supports,
    capabilities: fake.capabilities,
    send: fake.send,
  };
  return { driver, fake };
}

export async function servicesWith(drivers: LinkDriver[], devices: Device[]): Promise<Services> {
  const s = makeServices(drivers);
  await s.store.upsertRoom(room('r1', 'Bedroom', 0));
  for (const d of devices) await s.store.upsertDevice(d);
  await flush();
  return s;
}

export const acDevice = (over: Partial<Device> = {}): Device =>
  device('d1', 'r1', 0, { kind: 'ac', name: 'Bedroom AC', ...over });

export const fanDevice = (over: Partial<Device> = {}): Device =>
  device('d1', 'r1', 0, { kind: 'fan', name: 'Study fan', ...over });

/** A driver whose sends stay pending until `release()` lets the oldest one through. */
export function heldDriver(capabilities: Capabilities = {}): {
  driver: LinkDriver;
  sent: Command[];
  release(): Promise<void>;
} {
  const waiting: (() => void)[] = [];
  const sent: Command[] = [];
  const driver: LinkDriver = {
    kind: 'ir',
    available: () => true,
    supports: () => true,
    capabilities: () => capabilities,
    send: (_d, _l, cmd) =>
      new Promise<void>((resolve) => {
        waiting.push(() => {
          sent.push(cmd);
          resolve();
        });
      }),
  };
  return {
    driver,
    sent,
    release: async () => {
      waiting.shift()?.();
      await flush();
    },
  };
}
