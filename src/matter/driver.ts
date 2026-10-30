import { DeviceError, defaultAcState } from '@/core';
import type {
  AcMode,
  AcState,
  Capabilities,
  Command,
  Device,
  Link,
  LinkDriver,
  Reported,
  Unsubscribe,
} from '@/core';
import { MatterError } from '@/core/matterSetup';
import { assertLocal } from '@/transport/localOnly';
import { capabilitiesFrom, fromAttrs, toWrites } from './clusters';
import type { MatterAcInfo, MatterController } from './controller';

const DEFAULT_RESUBSCRIBE_MS = [1000, 2000, 5000, 10000, 30000];

const DEFAULT_CAPABILITIES: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: 16, max: 30 },
  swing: false,
  sleep: false,
};

export interface MatterDriverOptions {
  controller: MatterController;
  enabled: boolean;
  resubscribeMs?: number[];
}

interface NodeState {
  info?: MatterAcInfo;
  caps?: Capabilities;
  last: AcState;
  lost: boolean;
  local?: Promise<void>;
  notLocal: boolean;
}

type MatterLink = Extract<Link, { kind: 'matter' }>;

function isMatterLink(link: Link): link is MatterLink {
  return link.kind === 'matter';
}

export function createMatterDriver(o: MatterDriverOptions): LinkDriver & { kind: 'matter' } {
  const { controller } = o;
  const backoff = o.resubscribeMs ?? DEFAULT_RESUBSCRIBE_MS;
  const nodes = new Map<string, NodeState>();

  const node = (id: string): NodeState => {
    let n = nodes.get(id);
    if (!n) {
      n = { last: defaultAcState(), lost: false, notLocal: false };
      nodes.set(id, n);
    }
    return n;
  };

  /** Checks the operational address once per node; a refusal lasts until the app restarts. */
  const ensureLocal = (id: string, n: NodeState): Promise<void> => {
    if (n.notLocal) return Promise.reject(new DeviceError('notLocal'));
    if (!n.local) {
      n.local = (async (): Promise<void> => {
        const [addr, prefixes] = await Promise.all([
          controller.peerAddress(id),
          controller.onLinkPrefixes(),
        ]);
        if (addr === null) throw new DeviceError('notLocal', 'Unknown address');
        assertLocal(addr, prefixes);
      })().catch((e: unknown) => {
        n.local = undefined;
        if (e instanceof DeviceError && e.code === 'notLocal') {
          n.notLocal = true;
          throw e;
        }
        throw new DeviceError('notSent');
      });
    }
    return n.local;
  };

  const ensureInfo = async (id: string, n: NodeState): Promise<MatterAcInfo> => {
    if (n.info) return n.info;
    try {
      const info = await controller.info(id);
      n.info = info;
      n.caps = capabilitiesFrom(info);
      return info;
    } catch {
      throw new DeviceError('notSent');
    }
  };

  return {
    kind: 'matter',
    available: (): boolean => o.enabled && controller.available(),
    supports: (device: Device, _link: Link, cmd: Command): boolean =>
      device.kind === 'ac' && cmd.kind === 'ac.set',
    capabilities: (_device: Device, link: Link): Capabilities => {
      const caps = isMatterLink(link) ? nodes.get(link.nodeId)?.caps : undefined;
      return caps ?? DEFAULT_CAPABILITIES;
    },

    send: async (device: Device, link: Link, cmd: Command): Promise<void> => {
      if (!isMatterLink(link)) throw new DeviceError('noLink');
      if (device.kind !== 'ac' || cmd.kind !== 'ac.set') throw new DeviceError('unsupported');
      const id = link.nodeId;
      const n = node(id);
      await ensureLocal(id, n);
      const info = await ensureInfo(id, n);
      if (n.lost) {
        try {
          await controller.read(id);
        } catch {
          throw new DeviceError('notSent');
        }
      }
      const writes = toWrites(cmd.state, info);
      for (let i = 0; i < writes.length; i++) {
        const w = writes[i];
        if (!w) continue;
        try {
          await controller.write(id, w);
        } catch (e) {
          if (e instanceof MatterError && e.code === 'rejected') {
            if (w.systemMode !== undefined && n.caps?.acModes) {
              const mode: AcMode = cmd.state.mode;
              n.caps = { ...n.caps, acModes: n.caps.acModes.filter((m) => m !== mode) };
            }
            throw new DeviceError('unsupported');
          }
          throw new DeviceError(i === 0 ? 'notSent' : 'timeout');
        }
      }
      n.last = cmd.state;
    },

    observe: (_device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe => {
      if (!isMatterLink(link)) return () => undefined;
      const id = link.nodeId;
      const n = node(id);
      let disposed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsub: Unsubscribe | undefined;
      let attempt = 0;

      const emit = (a: Parameters<typeof fromAttrs>[0]): void => {
        if (disposed) return;
        const { state, roomTemp } = fromAttrs(a, n.last);
        n.last = state;
        cb(roomTemp === undefined ? { kind: 'ac', state } : { kind: 'ac', state, roomTemp });
      };

      const scheduleResubscribe = (): void => {
        if (disposed) return;
        n.lost = true;
        const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 1000;
        attempt++;
        timer = setTimeout(() => void connect(), delay);
      };

      const onLost = (): void => {
        unsub?.();
        unsub = undefined;
        scheduleResubscribe();
      };

      const connect = async (): Promise<void> => {
        timer = undefined;
        if (disposed) return;
        try {
          const attrs = await controller.read(id);
          if (disposed) return;
          unsub = controller.subscribe(id, emit, onLost);
          n.lost = false;
          attempt = 0;
          emit(attrs);
        } catch {
          scheduleResubscribe();
        }
      };

      void (async (): Promise<void> => {
        try {
          await ensureLocal(id, n);
        } catch (e) {
          // A non-local node is never observed; a transient failure retries.
          if (!(e instanceof DeviceError && e.code === 'notLocal')) scheduleResubscribe();
          return;
        }
        await connect();
      })();

      return (): void => {
        disposed = true;
        if (timer) clearTimeout(timer);
        unsub?.();
        unsub = undefined;
      };
    },
  };
}
