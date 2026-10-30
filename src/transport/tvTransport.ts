import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type { TvSocket, TvTransport } from '@/webos/transport';
import { assertLocal, isAllowedMulticast, isSubnetBroadcast, type Prefix } from './localOnly';
import { getOnLinkPrefixes, subnetBroadcast, subnetHosts } from './netInfo';

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const WOL_PORT = 9;
const PROBE_IN_FLIGHT = 32;

interface Datagram {
  on(event: 'message', cb: (msg: unknown, rinfo: { address: string }) => void): unknown;
  on(event: 'error', cb: (e: unknown) => void): unknown;
  once(event: 'listening', cb: () => void): unknown;
  bind(port: number): void;
  send(
    msg: string | unknown[],
    offset: number,
    length: number,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void;
  setBroadcast(flag: boolean): void;
  close(): void;
}

function hostOf(url: string): string {
  const m = /^wss?:\/\/(\[[^\]]+\]|[^/:]+)/.exec(url);
  return m?.[1]?.replace(/^\[|\]$/g, '') ?? '';
}

function text(msg: unknown): string {
  if (typeof msg === 'string') return msg;
  if (msg instanceof Uint8Array) return String.fromCharCode(...msg);
  return '';
}

function notSent(e: unknown): DeviceError {
  return e instanceof DeviceError ? e : new DeviceError('notSent', String(e));
}

/** Binds a UDP socket, runs `run` on it, and always closes it. */
function withSocket<T>(
  run: (s: Datagram, done: (v: T) => (() => void) | void, fail: (e: DeviceError) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4' }) as unknown as Datagram;
    let finished = false;
    let cleanup: (() => void) | void;
    const finish = (settle: () => void): void => {
      if (finished) return;
      finished = true;
      cleanup?.();
      try {
        sock.close();
      } catch {
        // already closed
      }
      settle();
    };
    sock.on('error', (e) => finish(() => reject(notSent(e))));
    sock.once('listening', () => {
      try {
        cleanup = run(
          sock,
          (v) => finish(() => resolve(v)),
          (e) => finish(() => reject(e)),
        );
      } catch (e) {
        finish(() => reject(notSent(e)));
      }
    });
    try {
      sock.bind(0);
    } catch (e) {
      finish(() => reject(notSent(e)));
    }
  });
}

function wrapSocket(ws: WebSocket): TvSocket {
  let closedByUs = false;
  let onMessage: ((t: string) => void) | undefined;
  const backlog: string[] = [];
  const closeCbs: (() => void)[] = [];
  ws.onmessage = (e: { data: unknown }): void => {
    if (typeof e.data !== 'string') return;
    if (onMessage) onMessage(e.data);
    else backlog.push(e.data);
  };
  ws.onclose = (): void => {
    if (!closedByUs) closeCbs.forEach((cb) => cb());
  };
  ws.onerror = (): void => undefined;
  return {
    send: (t) => ws.send(t),
    close: () => {
      closedByUs = true;
      ws.close();
    },
    onMessage: (cb) => {
      onMessage = cb;
      backlog.splice(0).forEach(cb);
    },
    onClose: (cb) => {
      closeCbs.push(cb);
    },
  };
}

/** `TvTransport` over React Native's `WebSocket` and `react-native-udp`. Every unicast connect goes
 *  through `assertLocal()`. Nothing is opened until first use. */
export function createRnTvTransport(
  deps: { prefixes?: () => Promise<Prefix[]> } = {},
): TvTransport {
  const prefixes = deps.prefixes ?? getOnLinkPrefixes;

  return {
    async open(url: string, timeoutMs: number): Promise<TvSocket> {
      assertLocal(hostOf(url), await prefixes());
      return new Promise<TvSocket>((resolve, reject) => {
        let settled = false;
        let ws: WebSocket;
        const fail = (why: string): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            // never opened
          }
          reject(new DeviceError('notSent', why));
        };
        const timer = setTimeout(() => fail(`timed out opening ${url}`), timeoutMs);
        try {
          ws = new WebSocket(url);
        } catch (e) {
          fail(String(e));
          return;
        }
        ws.onopen = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(wrapSocket(ws));
        };
        ws.onerror = (): void => fail(`cannot open ${url}`);
        ws.onclose = (): void => fail(`closed while opening ${url}`);
      });
    },

    async ssdpSearch(message, windowMs, onReply): Promise<void> {
      // iOS needs the multicast entitlement for SSDP; it uses the subnet probe only.
      if (Platform.OS === 'ios') return;
      if (!isAllowedMulticast(SSDP_ADDRESS)) throw new DeviceError('notLocal');
      await withSocket<void>((sock, done, fail) => {
        sock.on('message', (msg, rinfo) => onReply(text(msg), rinfo.address));
        sock.send(message, 0, message.length, SSDP_PORT, SSDP_ADDRESS, (e) => {
          if (e) fail(notSent(e));
        });
        const timer = setTimeout(() => done(undefined), windowMs);
        return () => clearTimeout(timer);
      });
    },

    async probe(ports, perHostMs, onOpen): Promise<void> {
      const local = await prefixes();
      const hosts = [...new Set(local.flatMap(subnetHosts))];
      const tryPort = (host: string, port: number): Promise<void> =>
        new Promise<void>((resolve) => {
          let settled = false;
          let ws: WebSocket | undefined;
          const finish = (opened: boolean): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
              ws?.close();
            } catch {
              // nothing to close
            }
            if (opened) onOpen(host, port);
            resolve();
          };
          const timer = setTimeout(() => finish(false), perHostMs);
          try {
            assertLocal(host, local);
            ws = new WebSocket(`${port === 3001 ? 'wss' : 'ws'}://${host}:${port}`);
            ws.onopen = (): void => finish(true);
            ws.onerror = (): void => finish(false);
            ws.onclose = (): void => finish(false);
          } catch {
            finish(false);
          }
        });
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < hosts.length) {
          const host = hosts[next++];
          if (host) await Promise.all(ports.map((p) => tryPort(host, p)));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PROBE_IN_FLIGHT, hosts.length) }, worker));
    },

    async sendWol(packet): Promise<void> {
      const local = await prefixes();
      if (local.length === 0) throw new DeviceError('notSent', 'Not on Wi-Fi');
      const targets = local
        .map(subnetBroadcast)
        .filter((address) => isSubnetBroadcast(address, local));
      if (targets.length === 0) throw new DeviceError('notLocal');
      await withSocket<void>((sock, done, fail) => {
        sock.setBroadcast(true);
        let left = targets.length;
        for (const address of targets) {
          sock.send(Array.from(packet), 0, packet.length, WOL_PORT, address, (e) => {
            if (e) fail(notSent(e));
            else if (--left === 0) done(undefined);
          });
        }
      });
    },

    onWifi: async (): Promise<boolean> => (await prefixes()).length > 0,
  };
}
