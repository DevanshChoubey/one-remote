import { DeviceError, MiraieError, defaultAcState } from '@/core';
import type {
  AcState,
  Capabilities,
  Command,
  Device,
  Link,
  LinkDriver,
  MiraieLink,
  Reported,
  Unsubscribe,
} from '@/core';
import type { MiraieApi } from './api';
import {
  applyStatus,
  connectionTopic,
  controlMessages,
  controlTopic,
  parseConnection,
  stateTopics,
} from './protocol';
import type { MiraieSession } from './session';

/**
 * The opt-in MirAIe cloud link (Panasonic India Wi-Fi ACs). `ac.set` becomes MirAIe control
 * messages on the broker; the AC's status comes back on its status topics. An IR link on the same
 * device takes over when this one cannot send (signed out, off, no internet, AC offline).
 */
export interface MiraieDriverOptions {
  session: MiraieSession;
  api: MiraieApi;
  /** Reconnect delays for observe, in ms. */
  backoffMs?: number[];
}

const CAPABILITIES: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: 16, max: 30 },
  swing: true,
  // acvs 1..5 are fixed vane positions [2 sources]; horizontal, powerful, quiet and nanoe are not
  // offered (their MirAIe values are not confirmed).
  swingV: true,
  // MirAIe has no sleep key we can confirm; the screen hides it for this link.
  sleep: false,
};

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

interface NodeState {
  /** The last state the AC reported or we sent; null while unknown. */
  last: AcState | null;
  /** From the connection or status topic; undefined while unknown. */
  online?: boolean;
}

const isMiraieLink = (l: Link): l is MiraieLink => l.kind === 'miraie';

export function createMiraieDriver(o: MiraieDriverOptions): LinkDriver {
  const backoff = o.backoffMs ?? BACKOFF_MS;
  const nodes = new Map<string, NodeState>();
  const node = (id: string): NodeState => {
    let n = nodes.get(id);
    if (!n) {
      n = { last: null };
      nodes.set(id, n);
    }
    return n;
  };

  return {
    kind: 'miraie',
    available: () => o.session.available(),
    supports: (device: Device, link: Link, cmd: Command): boolean =>
      isMiraieLink(link) && device.kind === 'ac' && cmd.kind === 'ac.set',
    capabilities: (): Capabilities => CAPABILITIES,

    async send(device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void> {
      if (!isMiraieLink(link)) throw new DeviceError('noLink');
      if (device.kind !== 'ac' || cmd.kind !== 'ac.set') throw new DeviceError('unsupported');
      if (signal?.aborted) throw new DeviceError('timeout');
      if (!o.session.available()) throw new DeviceError('notPaired');
      let conn;
      try {
        conn = await o.session.connection(link.homeId);
      } catch (e) {
        const signedOut = e instanceof MiraieError && (e.code === 'signedOut' || e.code === 'off');
        throw new DeviceError(signedOut ? 'notPaired' : 'notSent');
      }
      // The hub gave up while connecting: send nothing late.
      if (signal?.aborted) throw new DeviceError('timeout');
      const n = node(link.deviceId);
      // The AC told the broker it is offline: MirAIe would drop the command, so let IR try.
      if (n.online === false) throw new DeviceError('notSent');
      const msgs = controlMessages(cmd.state, n.last);
      const topic = controlTopic(link.topic);
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m === undefined) continue;
        if (i > 0 && signal?.aborted) throw new DeviceError('partiallySent');
        try {
          conn.publish(topic, m);
        } catch {
          throw new DeviceError(i === 0 ? 'notSent' : 'partiallySent');
        }
      }
      n.last = { ...cmd.state };
    },

    async forget(_device: Device, link: Link): Promise<void> {
      if (isMiraieLink(link)) nodes.delete(link.deviceId);
    },

    observe(_device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe {
      if (!isMiraieLink(link) || !o.session.available()) return () => undefined;
      const n = node(link.deviceId);
      const states = stateTopics(link.topic);
      const online = connectionTopic(link.topic);
      let disposed = false;
      let attempt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let offMessages: Unsubscribe | undefined;
      /** Bumped per connect, so a late close or failure of an older one schedules nothing. */
      let round = 0;

      const emit = (text: string): void => {
        if (disposed) return;
        const u = applyStatus(text, n.last ?? defaultAcState());
        if (!u) return;
        if (u.online !== undefined) n.online = u.online;
        n.last = u.state;
        cb(
          u.roomTemp === undefined
            ? { kind: 'ac', state: u.state }
            : { kind: 'ac', state: u.state, roomTemp: u.roomTemp },
        );
      };

      const retry = (r: number): void => {
        if (disposed || r !== round) return;
        round++;
        offMessages?.();
        offMessages = undefined;
        const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 30000;
        attempt++;
        timer = setTimeout(() => void connect(), delay);
      };

      const connect = async (): Promise<void> => {
        timer = undefined;
        if (disposed || !o.session.available()) return;
        const r = round;
        try {
          const conn = await o.session.connection(link.homeId);
          if (disposed) return;
          offMessages = conn.onMessage((topic, text) => {
            if (topic === online) {
              const up = parseConnection(text);
              if (up !== undefined) n.online = up;
            } else if (states.includes(topic)) {
              emit(text);
            }
          });
          conn.onClose(() => retry(r));
          await conn.subscribe([...states, online], 1);
          attempt = 0;
          // The broker sends changes only; the HTTP status gives the state now. Best effort.
          try {
            const text = await o.session.withToken((t) => o.api.status(t, link.deviceId));
            emit(text);
          } catch {
            // The next status message will do.
          }
        } catch (e) {
          // Signed out or turned off: stop; the hub observes again when the session is back.
          if (e instanceof MiraieError && (e.code === 'signedOut' || e.code === 'off')) return;
          retry(r);
        }
      };

      void connect();

      return () => {
        disposed = true;
        if (timer) clearTimeout(timer);
        offMessages?.();
        offMessages = undefined;
      };
    },
  };
}
