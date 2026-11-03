import {
  Crypto,
  Entropy,
  Environment,
  Network,
  Seconds,
  StorageService,
  StandardCrypto,
} from '@matter/general';
import { FanControl } from '@matter/types/clusters/fan-control';
import { OnOff } from '@matter/types/clusters/on-off';
import { Thermostat } from '@matter/types/clusters/thermostat';
import { ManualPairingCodeCodec, NodeId, QrPairingCodeCodec } from '@matter/types';
import { CommissioningController } from '@project-chip/matter.js';
import type { Unsubscribe } from '@/core';
import { MatterError } from '@/core/matterSetup';
import type { CommissionStep } from '@/core/matterSetup';
import { MatterNetwork } from '@/transport/matterNetwork';
import type { MatterAcAttrs, MatterAcInfo, MatterWrite } from '../controller';
import { installMatterPolyfills } from './polyfills';
import { MatterStorageDriver } from './storage';
import { createWebCrypto } from './webCrypto';

/**
 * matter.js behind the few calls One Remote needs. Loaded on first use only (see `controller.ts`),
 * so the app starts without paying for it. This is the only file that touches matter.js types.
 *
 * Local network only: no DCL lookup, no OTA, no cloud. The AC is found by mDNS on the home Wi-Fi
 * and spoken to on its local address.
 */
export interface MatterStack {
  commission(payload: string, onStep: (s: CommissionStep) => void): Promise<string>;
  info(nodeId: string): Promise<MatterAcInfo>;
  read(nodeId: string): Promise<MatterAcAttrs>;
  write(nodeId: string, w: MatterWrite): Promise<void>;
  subscribe(nodeId: string, onAttrs: (a: MatterAcAttrs) => void, onLost: () => void): Unsubscribe;
  removeFabric(nodeId: string): Promise<void>;
  peerAddress(nodeId: string): Promise<string | null>;
}

const DISCOVERY_TIMEOUT_S = 30;

/** A Rock bitmap as the number the rest of the app keeps (left-right 1, up-down 2, round 4). */
function rockBits(r: FanControl.Rock): number {
  return (r.rockLeftRight ? 1 : 0) | (r.rockUpDown ? 2 : 0) | (r.rockRound ? 4 : 0);
}
const ADMIN_LABEL = 'One Remote';

/** The 11 or 21 digit manual code, or an `MT:` QR payload, as a passcode and discriminator. */
export function decodePairingCode(payload: string): {
  passcode: number;
  longDiscriminator?: number;
  shortDiscriminator?: number;
} {
  try {
    if (payload.startsWith('MT:')) {
      const [first] = QrPairingCodeCodec.decode(payload);
      if (!first) throw new Error('empty');
      return { passcode: first.passcode, longDiscriminator: first.discriminator };
    }
    const data = ManualPairingCodeCodec.decode(payload);
    return {
      passcode: data.passcode,
      ...(data.discriminator !== undefined ? { longDiscriminator: data.discriminator } : {}),
      ...(data.shortDiscriminator !== undefined
        ? { shortDiscriminator: data.shortDiscriminator }
        : {}),
    };
  } catch {
    throw new MatterError('badCode');
  }
}

/** `udp://[fd00::1]:5540` or `udp://192.168.1.5:5540` as the bare host, else null. */
export function hostOfOperationalAddress(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^[a-z]+:\/\/(?:\[([^\]]+)\]|([^:/]+))(?::\d+)?/i.exec(url);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

type Status = { code?: number };

/** Maps what matter.js throws to the controller's error codes. */
export function mapError(e: unknown, fallback: MatterError['code'] = 'unreachable'): MatterError {
  if (e instanceof MatterError) return e;
  const code = (e as Status | undefined)?.code;
  // Matter IM status: UnsupportedAttribute 0x86, UnsupportedWrite 0x88, ConstraintError 0x87,
  // InvalidAction 0x80, InvalidCommand 0x85, UnsupportedCommand 0x81, UnsupportedCluster 0xc3, Failure 0x01.
  if (typeof code === 'number' && [0x01, 0x80, 0x81, 0x85, 0x86, 0x87, 0x88, 0xc3].includes(code)) {
    return new MatterError('rejected');
  }
  if (typeof code === 'number' && code === 0x7e) return new MatterError('notFound');
  return new MatterError(fallback);
}

function buildEnvironment(): Environment {
  const env = new Environment('one-remote');
  const crypto = new StandardCrypto(createWebCrypto());
  env.set(Crypto, crypto);
  env.set(Entropy, crypto);
  Environment.default.set(Crypto, crypto);
  Environment.default.set(Entropy, crypto);
  env.set(Network, new MatterNetwork());
  const storage = env.get(StorageService);
  storage.registerDriver(MatterStorageDriver);
  storage.defaultDriver = MatterStorageDriver.id;
  return env;
}

export async function createMatterStack(): Promise<MatterStack> {
  installMatterPolyfills();
  const controller = new CommissioningController({
    environment: { environment: buildEnvironment(), id: 'one-remote' },
    autoConnect: false,
    adminFabricLabel: ADMIN_LABEL,
  });
  await controller.start();

  const nodeIdOf = (id: string): NodeId => NodeId(BigInt(id));

  type Paired = Awaited<ReturnType<CommissioningController['getNode']>>;
  const nodeOf = async (id: string): Promise<Paired> => {
    try {
      return await controller.getNode(nodeIdOf(id));
    } catch (e) {
      throw mapError(e, 'notFound');
    }
  };

  /** The paired node, connected, with the endpoint that carries the thermostat. */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred from matter.js
  const acOf = async (id: string) => {
    const node = await nodeOf(id);
    if (!node.isConnected) node.connect();
    const endpoint = node.getDevices().find((d) => d.getClusterClient(Thermostat.Complete));
    const thermostat = endpoint?.getClusterClient(Thermostat.Complete);
    if (!endpoint || !thermostat) throw new MatterError('unreachable');
    return {
      node,
      thermostat,
      onOff: endpoint.getClusterClient(OnOff.Complete),
      fan: endpoint.getClusterClient(FanControl.Complete),
    };
  };

  const readAttrs = async (id: string, remote = true): Promise<MatterAcAttrs> => {
    const { thermostat, onOff, fan } = await acOf(id);
    try {
      const [mode, setpoint, local] = await Promise.all([
        thermostat.attributes.systemMode.get(remote),
        thermostat.attributes.occupiedCoolingSetpoint?.get(remote),
        thermostat.attributes.localTemperature.get(remote),
      ]);
      const on = await onOff?.attributes.onOff.get(remote);
      const fanMode = await fan?.attributes.fanMode.get(remote);
      const rock = await fan?.attributes.rockSetting?.get(remote);
      if (mode === undefined) throw new MatterError('rejected');
      return {
        systemMode: mode as number,
        occupiedCoolingSetpoint: setpoint ?? 2400,
        localTemperature: local ?? null,
        ...(on !== undefined ? { onOff: on } : {}),
        ...(fanMode !== undefined ? { fanMode } : {}),
        ...(rock !== undefined ? { rockSetting: rockBits(rock) } : {}),
      };
    } catch (e) {
      throw mapError(e);
    }
  };

  return {
    async commission(payload, onStep) {
      const { passcode, longDiscriminator, shortDiscriminator } = decodePairingCode(payload);
      const identifierData =
        longDiscriminator !== undefined
          ? { longDiscriminator }
          : shortDiscriminator !== undefined
            ? { shortDiscriminator }
            : {};
      let nodeId: NodeId;
      try {
        const found = await controller.discoverCommissionableDevices(
          identifierData,
          { onIpNetwork: true },
          undefined,
          Seconds(DISCOVERY_TIMEOUT_S),
        );
        const device = found[0];
        if (!device) throw new MatterError('notFound', 'found');
        onStep('found');
        controller.cancelCommissionableDeviceDiscovery(identifierData, { onIpNetwork: true });
        onStep('network');
        nodeId = await controller.commissionNode({
          commissioning: {},
          discovery: { commissionableDevice: device },
          passcode,
        });
      } catch (e) {
        if (e instanceof MatterError) throw e;
        // A wrong code fails the secure-channel handshake; anything later is the AC joining us.
        const text = e instanceof Error ? e.message : '';
        if (/pase|passcode|pairing|spake|secure channel/i.test(text)) {
          throw new MatterError('badCode', 'found');
        }
        throw new MatterError('networkFailed', 'network');
      }
      const id = nodeId.toString();
      try {
        await readAttrs(id);
      } catch {
        throw new MatterError('noResponse', 'responds');
      }
      onStep('responds');
      return id;
    },

    async info(id) {
      const { thermostat, onOff, fan } = await acOf(id);
      try {
        const sequence = await fan?.attributes.fanModeSequence.get(true);
        const rockSupport = await fan?.attributes.rockSupport?.get(true);
        const min = await thermostat.attributes.absMinCoolSetpointLimit?.get(true);
        const max = await thermostat.attributes.absMaxCoolSetpointLimit?.get(true);
        return {
          hasOnOff: onOff !== undefined,
          absMinCool: min ?? 1600,
          absMaxCool: max ?? 3000,
          ...(sequence !== undefined ? { fanModeSequence: sequence as number } : {}),
          ...(rockSupport !== undefined ? { rockSupport: rockBits(rockSupport) } : {}),
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    read: readAttrs,

    async write(id, w) {
      const { thermostat, onOff, fan } = await acOf(id);
      try {
        if (w.onOff !== undefined) {
          if (!onOff) throw new MatterError('rejected');
          await (w.onOff ? onOff.commands.on() : onOff.commands.off());
        }
        if (w.systemMode !== undefined) {
          await thermostat.attributes.systemMode.set(w.systemMode);
        }
        if (w.occupiedCoolingSetpoint !== undefined) {
          await thermostat.attributes.occupiedCoolingSetpoint.set(w.occupiedCoolingSetpoint);
        }
        if (w.fanMode !== undefined) {
          if (!fan) throw new MatterError('rejected');
          await fan.attributes.fanMode.set(w.fanMode);
        }
        if (w.rockSetting !== undefined) {
          if (!fan) throw new MatterError('rejected');
          await fan.attributes.rockSetting.set(new FanControl.Rock(w.rockSetting));
        }
      } catch (e) {
        throw mapError(e);
      }
    },

    subscribe(id, onAttrs, onLost) {
      let closed = false;
      let detach: (() => void) | undefined;
      void nodeOf(id).then(
        (node) => {
          if (closed) return;
          const changed = (): void => {
            // The subscription already refreshed the node's cache; read it without another round trip.
            void readAttrs(id, false).then(onAttrs, () => undefined);
          };
          const state = (s: number): void => {
            // 0 connected; anything else means the AC stopped answering.
            if (s === 0) changed();
            else onLost();
          };
          node.events.attributeChanged.on(changed);
          node.events.stateChanged.on(state);
          detach = () => {
            node.events.attributeChanged.off(changed);
            node.events.stateChanged.off(state);
          };
          if (!node.isConnected) node.connect();
        },
        () => {
          if (!closed) onLost();
        },
      );
      return () => {
        closed = true;
        detach?.();
      };
    },

    async removeFabric(id) {
      try {
        // Decommissioning removes our fabric on the AC (RemoveFabric), then forgets the node here.
        await controller.removeNode(nodeIdOf(id), true);
      } catch (e) {
        throw mapError(e);
      }
    },

    peerAddress(id) {
      const details = controller
        .getCommissionedNodesDetails()
        .find((d) => d.nodeId.toString() === id);
      return Promise.resolve(hostOfOperationalAddress(details?.operationalAddress));
    },
  };
}
