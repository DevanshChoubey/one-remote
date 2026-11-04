import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { SavedDispenser } from '@/aer/types';
import type { Device } from '@/core';
import { Button, Column, Screen, Txt } from '@/ui';
import { useServices } from '@/services';

/**
 * Nearly empty (0% left after rounding): the engine plans refillLow and refillOut, but only refillOut
 * (the severe one) reaches the phone; refillLow folds into it. Use about 2000 to see refillLow alone.
 */
const NEARLY_EMPTY_SPRAYS = 2190;

/** The saved dispenser (or one built from `device` when never read) with a nearly empty can read at `now`. */
export function nearlyEmpty(
  saved: SavedDispenser | null,
  device: Device,
  now: Date,
): SavedDispenser {
  const link = device.links.find((l) => l.kind === 'aer');
  const base: SavedDispenser = saved ?? {
    id: device.id,
    bleId: link?.kind === 'aer' ? link.bleId : '',
    name: device.name,
    homeTimeZone: link?.kind === 'aer' ? link.timeZone : 'UTC',
  };
  return {
    ...base,
    lastStatus: {
      batteryMv: 3000,
      firmware: '',
      autoSpray: null,
      scheduleRunning: false,
      ...base.lastStatus,
      spraysSinceRefill: NEARLY_EMPTY_SPRAYS,
      at: now.toISOString(),
    },
  };
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/** Plans the refill alerts for an added dispenser now, to check the notifications on a phone. */
function AerSpike(): ReactElement {
  const { store, aerAlerts, aerDispensers } = useServices();
  const [devices, setDevices] = useState<Device[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string): void => setLog((l) => [...l.slice(-99), `${stamp()} ${line}`]);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      store.devices().then(
        (all) => {
          if (alive) setDevices(all.filter((d) => d.kind === 'aer'));
        },
        (e: unknown) => console.error('Could not load the devices', e),
      );
    };
    load();
    const stop = store.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [store]);

  const planNow = async (device: Device): Promise<void> => {
    if (!aerDispensers) return add('no aer readings store');
    try {
      await aerDispensers.upsert(
        nearlyEmpty(await aerDispensers.get(device.id), device, new Date()),
      );
      add(`${device.name}: wrote ${NEARLY_EMPTY_SPRAYS} sprays`);
      await aerAlerts.sync({ mayAsk: true });
      add(`pending: ${(await aerAlerts.pendingKeys()).join(', ') || 'none'}`);
    } catch (e) {
      add(`FAILED: ${String(e)}`);
    }
  };

  return (
    <Screen title="Aer spike" scroll>
      <Column gap={3}>
        {devices.length === 0 ? <Txt>Add an air freshener first.</Txt> : null}
        {devices.map((d) => (
          <Button
            key={d.id}
            label={`Plan a refill alert now: ${d.name}`}
            onPress={() => void planNow(d)}
          />
        ))}
        {log.map((l, i) => (
          <Txt key={i} variant="caption" selectable>
            {l}
          </Txt>
        ))}
      </Column>
    </Screen>
  );
}

export default function AerSpikeRoute(): ReactElement {
  if (!__DEV__) return <Redirect href="/" />;
  return <AerSpike />;
}
