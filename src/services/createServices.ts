import AsyncStorage from '@react-native-async-storage/async-storage';
import { isTvLink, tvLinkOf, tvLinkRef } from '@/core';
import type { Device, LinkDriver, TvLink, TvSetup } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createAsyncStoragePreferenceStore } from '@/store/preferences';
import { createSecureSecretStore } from '@/store/secrets';
import { createRnTvTransport } from '@/transport/tvTransport';
import { tvHostChanged } from '@/tv/hostChanged';
import { createCompositeTvSetup } from '@/tv/setup';
import { createAndroidTvDriver } from '@/androidtv/driver';
import { createAndroidTvBrand } from '@/androidtv/setup';
import { createWebosDriver } from '@/webos/driver';
import { createFrameTap } from '@/webos/frameTap';
import { createWebosBrand } from '@/webos/setup';
import type { TvTransport } from '@/tv/transport';
import type { Services } from './services';

/** Keeps the hub's device list equal to the store's; applies the newest read that succeeded. */
function syncHub(hub: DeviceHub, store: Services['store']): void {
  let issued = 0;
  let applied = 0;
  const load = (): void => {
    const mine = ++issued;
    store.devices().then(
      (devices: Device[]) => {
        if (mine < applied) return;
        applied = mine;
        hub.setDevices(devices);
      },
      (e: unknown) => console.error('Could not load devices into the hub', e),
    );
  };
  store.subscribe(load);
  load();
}

/** Runs one cleanup step; a failure (sync or async) is logged and never blocks the removal. */
function bestEffort(what: string, job: () => Promise<void>): Promise<void> {
  try {
    return job().catch((e: unknown) => console.error(`Could not ${what}`, e));
  } catch (e) {
    console.error(`Could not ${what}`, e);
    return Promise.resolve();
  }
}

/**
 * Removes a device from the store, then lets each link's driver forget it (secrets, fabric,
 * per-node data) and deletes the webOS client key. The cleanup is best effort: a failure is logged
 * and the device stays removed.
 */
function removeDeviceWith(
  store: Services['store'],
  secrets: Services['secrets'],
  drivers: Services['drivers'],
): Services['removeDevice'] {
  return async (id) => {
    const device = (await store.devices()).find((d) => d.id === id);
    await store.removeDevice(id);
    if (!device) return;
    await Promise.all(
      device.links.flatMap((link) => {
        const jobs: Promise<void>[] = [];
        const driver = drivers.find((d) => d.kind === link.kind);
        const forget = driver?.forget?.bind(driver);
        if (forget) jobs.push(bestEffort(`forget a ${link.kind} link`, () => forget(device, link)));
        if (link.kind === 'webos') {
          jobs.push(bestEffort('delete a device secret', () => secrets.delete(link.clientKeyRef)));
        }
        return jobs;
      }),
    );
  };
}

/** What a lane's driver may need from the composition root. */
interface LaneContext {
  store: Services['store'];
  secrets: Services['secrets'];
  tvTransport: TvTransport;
}

/** The real drivers, one per line, each just under its lane's slot comment. */
function laneDrivers(ctx: LaneContext): LinkDriver[] {
  return [
    // tv lane
    createWebosDriver({
      transport: ctx.tvTransport,
      secrets: ctx.secrets,
      onHostChanged: tvHostChanged(ctx.store),
    }),
    // androidtv lane
    createAndroidTvDriver({
      transport: ctx.tvTransport,
      devices: () => ctx.store.devices(),
      onHostChanged: tvHostChanged(ctx.store),
    }),
    // ir lane
    // matter lane
  ];
}

type ClearsNotPaired = LinkDriver & {
  clearNotPaired(deviceId: string, link?: TvLink): void;
};

function canClearNotPaired(d: LinkDriver): d is ClearsNotPaired {
  return 'clearNotPaired' in d && typeof d.clearNotPaired === 'function';
}

/**
 * Makes the TV setup finish its job: a TV found at a new address is saved (as the driver's own
 * rediscovery does), and after pairing again the driver of that brand is released from its "not
 * paired" latch, so it connects with the new key without an app restart.
 */
export function withTvFollowUp(
  tv: TvSetup,
  store: Services['store'],
  drivers: Services['drivers'],
): TvSetup {
  const hostChanged = tvHostChanged(store);
  return {
    ...tv,
    async findAgain(device) {
      const host = await tv.findAgain(device);
      const current = tvLinkOf(device);
      if (host !== null && current?.host !== host) {
        await hostChanged(device.id, host);
      }
      return host;
    },
    async pair(found, prompts, reuse) {
      const paired = await tv.pair(found, prompts, reuse);
      if (reuse === undefined) return paired;
      try {
        const reuseRef = tvLinkRef(reuse);
        const pairedRef = tvLinkRef(paired.link);
        for (const d of await store.devices()) {
          const link = d.links.find(
            (l): l is TvLink =>
              isTvLink(l) &&
              l.kind === paired.link.kind &&
              tvLinkRef(l) === pairedRef &&
              // Every Android TV shares one phone-wide cert, so tell them apart by address.
              (l.kind !== 'androidtv' || l.host === reuse.host),
          );
          if (!link || link.kind !== reuse.kind || tvLinkRef(link) !== reuseRef) continue;
          const driver = drivers.find((x) => x.kind === link.kind && canClearNotPaired(x));
          // Save the new address first, then release the driver with that same link, so a
          // stale stored host can never put the old one back.
          const merged = { ...link, ...paired.link } as TvLink;
          await store.upsertDevice({
            ...d,
            links: d.links.map((l) => (l === link ? merged : l)),
          });
          if (driver && canClearNotPaired(driver)) driver.clearNotPaired(d.id, merged);
        }
      } catch (e) {
        console.error('Could not release the TV driver after pairing', e);
      }
      return paired;
    },
  };
}

/** `tvTransport` replaces the real TV network (tests pass a fake). */
export type CreateServicesDeps = Partial<Services> & { tvTransport?: TvTransport };

/**
 * Builds the app's services. Pass any part to replace it (tests pass memory stores and fake
 * drivers). Each lane adds its lines just under its own slot comments below (its setup lines, its
 * driver in `drivers`, its setup object in the result), so lane merges do not conflict.
 */
export function createServices(deps: CreateServicesDeps = {}): Services {
  // tv lane
  const tvTap = __DEV__ ? createFrameTap() : undefined;
  const tvBase = deps.tvTransport ?? createRnTvTransport();
  const tvTransport = tvTap ? tvTap.wrap(tvBase) : tvBase;
  // ir lane
  // matter lane
  const store = deps.store ?? createAsyncStorageStore(AsyncStorage);
  const secrets = deps.secrets ?? createSecureSecretStore();
  const drivers = deps.drivers ?? laneDrivers({ store, secrets, tvTransport });
  const hub = deps.hub ?? new DeviceHub({ drivers });
  const prefs = deps.prefs ?? createAsyncStoragePreferenceStore(AsyncStorage);
  syncHub(hub, store);
  const tvBrands = [
    createWebosBrand({ transport: tvTransport, secrets }),
    // androidtv brand
    createAndroidTvBrand({ transport: tvTransport }),
    // samsung brand
  ];
  const removeDevice = deps.removeDevice ?? removeDeviceWith(store, secrets, drivers);
  return {
    hub,
    store,
    secrets,
    prefs,
    drivers,
    removeDevice,
    // tv lane
    tv: withTvFollowUp(
      deps.tv ??
        createCompositeTvSetup({
          brands: tvBrands,
          transport: tvTransport,
          frames: tvTap,
        }),
      store,
      drivers,
    ),
    tvBrands:
      deps.tvBrands ??
      tvBrands.map(({ kind, labelKey, pairing, codeLength }) => ({
        kind,
        labelKey,
        pairing,
        ...(codeLength !== undefined ? { codeLength } : {}),
      })),
    // ir lane
    // matter lane
  };
}
