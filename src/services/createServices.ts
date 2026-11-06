import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAlerts, createAlertStateStore } from '@/aer/alerts';
import type { Alerts, AlertScheduler } from '@/aer/alerts';
import { createAer } from '@/aer/service';
import type { AerService } from '@/aer/types';
import { isTvLink, tvLinkOf, tvLinkRef } from '@/core';
import type { AcState, Device, FanState, LinkDriver, TvLink, TvSetup } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createIrDriver } from '@/ir/driver';
import type { IrEmitter } from '@/ir/emitter';
import { createIrSetup } from '@/ir/setup';
import { createNativeMatterController } from '@/matter/native/controller';
import { createMatterSetup } from '@/matter/native/setup';
import { createMatterDriver } from '@/matter/driver';
import { createGreeClient } from '@/gree/client';
import type { GreeClient } from '@/gree/client';
import { createGreeDriver } from '@/gree/driver';
import { greeLinkChanged } from '@/gree/linkChanged';
import { createGreeSetup } from '@/gree/setup';
import { createRnGreeUdp } from '@/transport/greeUdp';
import type { MatterController } from '@/matter/controller';
import { createMiraieApi } from '@/miraie/api';
import { createMiraieDriver } from '@/miraie/driver';
import { createMiraieSession } from '@/miraie/session';
import type { MiraieApi } from '@/miraie/api';
import type { MiraieSession } from '@/miraie/session';
import { createCloudNet, platformFetch } from '@/transport/cloud';
import { dialTls } from '@/transport/cloudTls';
import { createNativeIrEmitter } from '@/transport/irEmitter';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createAsyncStoragePreferenceStore } from '@/store/preferences';
import { createSecureSecretStore } from '@/store/secrets';
import { createRnTvTransport } from '@/transport/tvTransport';
import { tvHostChanged } from '@/tv/hostChanged';
import { createCompositeTvSetup } from '@/tv/setup';
import { createAndroidTvDriver } from '@/androidtv/driver';
import { createAndroidTvBrand } from '@/androidtv/setup';
import { createSamsungDriver } from '@/samsung/driver';
import { createSamsungBrand } from '@/samsung/setup';
import { createWebosDriver } from '@/webos/driver';
import { createFrameTap } from '@/webos/frameTap';
import { createWebosBrand } from '@/webos/setup';
import { createNativeDictation } from '@/voice/dictation';
import { createNativeMic } from '@/voice/mic';
import type { TvTransport } from '@/tv/transport';
import { bleSupported, createRnTransport } from '@/transport/ble/rnTransport';
import type { BleTransport } from '@/transport/ble/transport';
import { createExpoScheduler } from './aerAlerts';
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
  aer: AerService,
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
        if (link.kind === 'aer') {
          jobs.push(bestEffort('forget an air freshener', () => aer.forget(device.id)));
        }
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
  irEmitter: IrEmitter;
  matterController: MatterController;
  greeClient: GreeClient;
  miraie: { session: MiraieSession; api: MiraieApi };
}

/** The IR driver's `seedFan` or `seedAc`, when `d` has one (tests may pass plain fakes). */
function seedOf<S>(
  d: LinkDriver,
  name: 'seedFan' | 'seedAc',
): ((id: string, s: S) => void) | undefined {
  const seed = (d as { seedFan?: unknown; seedAc?: unknown })[name];
  return typeof seed === 'function' ? (seed.bind(d) as (id: string, s: S) => void) : undefined;
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
    // samsung lane
    createSamsungDriver({
      transport: ctx.tvTransport,
      secrets: ctx.secrets,
      onHostChanged: tvHostChanged(ctx.store),
    }),
    // ir lane
    createIrDriver({ emitter: ctx.irEmitter }),
    // matter lane
    createMatterDriver({ controller: ctx.matterController, enabled: true }),
    // gree lane
    createGreeDriver({ client: ctx.greeClient, onLinkChanged: greeLinkChanged(ctx.store) }),
    // miraie lane
    createMiraieDriver(ctx.miraie),
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
        const reusedLink = (d: Device): TvLink | undefined => {
          const link = d.links.find(
            (l): l is TvLink =>
              isTvLink(l) &&
              l.kind === paired.link.kind &&
              tvLinkRef(l) === pairedRef &&
              // Every Android TV shares one phone-wide cert, so tell them apart by address.
              (l.kind !== 'androidtv' || l.host === reuse.host),
          );
          return link && link.kind === reuse.kind && tvLinkRef(link) === reuseRef
            ? link
            : undefined;
        };
        for (const { id } of (await store.devices()).filter((d) => reusedLink(d))) {
          // Save the new address first, then release the driver with that same link, so a
          // stale stored host can never put the old one back. The change is made on the stored
          // device inside the store's queue, so an overlapping write is not lost.
          let merged: TvLink | undefined;
          await store.updateDevice(id, (d) => {
            const link = reusedLink(d);
            if (!link) return null;
            const next = { ...link, ...paired.link } as TvLink;
            merged = next;
            return { ...d, links: d.links.map((l) => (l === link ? next : l)) };
          });
          if (!merged) continue;
          const kind = merged.kind;
          const driver = drivers.find((x) => x.kind === kind && canClearNotPaired(x));
          if (driver && canClearNotPaired(driver)) driver.clearNotPaired(id, merged);
        }
      } catch (e) {
        console.error('Could not release the TV driver after pairing', e);
      }
      return paired;
    },
  };
}

/**
 * Starts `alerts` only after `load` (the aer cache) has finished, so the first sync sees the saved
 * readings. A failed load is logged and the alerts start anyway; stopping before the load ends
 * means they never start.
 */
export function startAfter(load: () => Promise<void>, alerts: Alerts): Alerts {
  return {
    ...alerts,
    start() {
      let stopped = false;
      let stopInner: (() => void) | undefined;
      const begin = (): void => {
        if (!stopped) stopInner = alerts.start();
      };
      let loading: Promise<void>;
      try {
        loading = load();
      } catch (e) {
        loading = Promise.reject(e);
      }
      loading
        .catch((e: unknown) => console.error('Could not load the air freshener readings', e))
        .then(begin)
        .catch((e: unknown) => console.error('Could not start the air freshener alerts', e));
      return () => {
        stopped = true;
        stopInner?.();
      };
    },
  };
}

/**
 * The opt-in MirAIe cloud connection. The transport is open only while `session.netAllowed()`
 * (on in Settings, or signing in), and reaches only the MirAIe hosts.
 */
function createMiraie(
  secrets: Services['secrets'],
  prefs: Services['prefs'],
): { session: MiraieSession; api: MiraieApi } {
  let session: MiraieSession | undefined;
  const net = createCloudNet({
    enabled: () => session?.netAllowed() ?? false,
    dial: dialTls,
    fetch: platformFetch,
  });
  const api = createMiraieApi({ net });
  session = createMiraieSession({
    api,
    net,
    secrets,
    loadOptIn: async () => (await prefs.get()).miraieCloud,
    saveOptIn: (on) => prefs.set({ miraieCloud: on }),
  });
  return { session, api };
}

/**
 * `tvTransport` replaces the real TV network, `bleTransport` the real Bluetooth and
 * `aerScheduler` the real local notifications (tests pass fakes).
 */
export type CreateServicesDeps = Partial<Services> & {
  tvTransport?: TvTransport;
  bleTransport?: BleTransport;
  aerScheduler?: AlertScheduler;
};

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
  const irEmitter = createNativeIrEmitter();
  // matter lane
  const matterController = createNativeMatterController();
  // gree lane
  const greeClient = createGreeClient({ udp: createRnGreeUdp() });
  const store = deps.store ?? createAsyncStorageStore(AsyncStorage);
  const secrets = deps.secrets ?? createSecureSecretStore();
  const prefs = deps.prefs ?? createAsyncStoragePreferenceStore(AsyncStorage);
  // miraie lane
  const miraie = createMiraie(secrets, prefs);
  const drivers =
    deps.drivers ??
    laneDrivers({
      store,
      secrets,
      tvTransport,
      irEmitter,
      matterController,
      greeClient,
      miraie,
    });
  const hub = deps.hub ?? new DeviceHub({ drivers });
  // Signing in or out of MirAIe changes which links can send: let the hub look again.
  miraie.session.subscribe(() => hub.refresh());
  syncHub(hub, store);
  const tvBrands = [
    createWebosBrand({ transport: tvTransport, secrets }),
    // androidtv brand
    createAndroidTvBrand({ transport: tvTransport }),
    // samsung brand
    createSamsungBrand({ transport: tvTransport, secrets }),
  ];
  // aer lane
  // Exactly one createAer per app: its store holds the readings in memory.
  const aerParts = createAer({
    transport: deps.bleTransport ?? createRnTransport(),
    home: store,
    storage: AsyncStorage,
    supported: bleSupported(),
  });
  const aer = deps.aer ?? aerParts.service;
  const aerAlerts =
    deps.aerAlerts ??
    startAfter(
      () => aerParts.start(),
      createAlerts({
        store: aerParts.dispenserStore,
        scheduler: deps.aerScheduler ?? createExpoScheduler(),
        state: createAlertStateStore(AsyncStorage),
      }),
    );
  const removeDevice = deps.removeDevice ?? removeDeviceWith(store, secrets, drivers, aer);
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
    // voice
    voice: deps.voice ?? { mic: createNativeMic(), dictation: createNativeDictation() },
    // ir lane
    ir:
      deps.ir ??
      createIrSetup({
        emitter: irEmitter,
        seedFan: (id, state) => {
          for (const d of drivers) if (d.kind === 'ir') seedOf<FanState>(d, 'seedFan')?.(id, state);
        },
        seedAc: (id, state) => {
          for (const d of drivers) if (d.kind === 'ir') seedOf<AcState>(d, 'seedAc')?.(id, state);
        },
      }),
    // matter lane
    matter: deps.matter ?? createMatterSetup(matterController),
    // gree lane
    gree: deps.gree ?? createGreeSetup({ client: greeClient }),
    // miraie lane
    miraie: deps.miraie ?? miraie.session,
    // aer lane
    aer,
    aerAlerts,
    // Dev only (the spike writes readings through it); release builds leave it out.
    aerDispensers: __DEV__ ? aerParts.dispenserStore : undefined,
  };
}
