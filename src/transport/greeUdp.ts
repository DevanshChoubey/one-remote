import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type { GreeUdp } from '@/gree/udp';
import { assertLocal, isLocalAddress, isSubnetBroadcast, type Prefix } from './localOnly';
import { getOnLinkPrefixes, subnetBroadcast, subnetHosts } from './netInfo';

const GREE_PORT = 7000;

interface Datagram {
  on(event: 'message', cb: (msg: unknown, rinfo: { address: string }) => void): unknown;
  on(event: 'error', cb: (e: unknown) => void): unknown;
  once(event: 'listening', cb: () => void): unknown;
  bind(port: number): void;
  send(
    msg: string,
    offset: number,
    length: number,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void;
  setBroadcast(flag: boolean): void;
  close(): void;
}

function text(msg: unknown): string {
  if (typeof msg === 'string') return msg;
  if (msg instanceof Uint8Array) {
    let out = '';
    for (const b of msg) out += String.fromCharCode(b);
    return out;
  }
  return '';
}

/** Opens one UDP socket on a free port and hands it to `run` once listening; always closes it. */
function withSocket<T>(
  run: (
    s: Datagram,
    done: (v: T) => void,
    fail: (e: DeviceError) => void,
    onClose: (fn: () => void) => void,
  ) => void,
  onError: () => DeviceError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let sock: Datagram;
    try {
      sock = dgram.createSocket({ type: 'udp4' }) as unknown as Datagram;
    } catch (e) {
      reject(new DeviceError('notSent', String(e)));
      return;
    }
    let finished = false;
    const cleanups: (() => void)[] = [];
    const finish = (settle: () => void): void => {
      if (finished) return;
      finished = true;
      cleanups.forEach((fn) => fn());
      try {
        sock.close();
      } catch {
        // already closed
      }
      settle();
    };
    sock.on('error', () => finish(() => reject(onError())));
    sock.once('listening', () => {
      try {
        run(
          sock,
          (v) => finish(() => resolve(v)),
          (e) => finish(() => reject(e)),
          (fn) => cleanups.push(fn),
        );
      } catch (e) {
        finish(() => reject(new DeviceError('notSent', String(e))));
      }
    });
    try {
      sock.bind(0);
    } catch (e) {
      finish(() => reject(new DeviceError('notSent', String(e))));
    }
  });
}

/**
 * `GreeUdp` over react-native-udp. Every address goes through the local-only checks: a request to a
 * host off the home network is refused (`notLocal`) before a socket opens, a scan goes only to the
 * subnet broadcast and the subnet's own hosts, and replies from anywhere else are dropped.
 * iOS blocks broadcast without the multicast entitlement, so there the scan asks each host in turn.
 */
export function createRnGreeUdp(
  deps: { prefixes?: () => Promise<Prefix[]>; os?: string } = {},
): GreeUdp {
  const prefixes = deps.prefixes ?? getOnLinkPrefixes;
  const os = deps.os ?? Platform.OS;

  return {
    onWifi: async (): Promise<boolean> => (await prefixes()).length > 0,

    async scan(message, windowMs, onReply): Promise<void> {
      const local = await prefixes();
      if (local.length === 0) throw new DeviceError('notSent', 'Not on Wi-Fi');
      const broadcast =
        os === 'ios'
          ? []
          : local.map(subnetBroadcast).filter((address) => isSubnetBroadcast(address, local));
      const hosts = [...new Set(local.flatMap(subnetHosts))].filter((h) =>
        isLocalAddress(h, local),
      );
      const targets = [...broadcast, ...hosts];
      if (targets.length === 0) throw new DeviceError('notLocal');
      await withSocket<void>(
        (sock, done, fail, onClose) => {
          if (broadcast.length > 0) sock.setBroadcast(true);
          sock.on('message', (msg, rinfo) => {
            // Only the home network answers us.
            if (isLocalAddress(rinfo.address, local)) onReply(text(msg), rinfo.address);
          });
          let left = targets.length;
          let wentOut = 0;
          for (const address of targets) {
            sock.send(message, 0, message.length, GREE_PORT, address, (e) => {
              if (!e) wentOut++;
              // One unreachable host is fine; nothing at all going out is not.
              if (--left === 0 && wentOut === 0) fail(new DeviceError('notSent', 'Scan not sent'));
            });
          }
          const timer = setTimeout(() => done(undefined), windowMs);
          onClose(() => clearTimeout(timer));
        },
        () => new DeviceError('notSent', 'Socket error'),
      );
    },

    async request(host, message, timeoutMs): Promise<string> {
      assertLocal(host, await prefixes());
      let sent = false;
      return withSocket<string>(
        (sock, done, fail, onClose) => {
          sock.on('message', (msg, rinfo) => {
            if (rinfo.address === host) done(text(msg));
          });
          sock.send(message, 0, message.length, GREE_PORT, host, (e) => {
            if (e) fail(new DeviceError('notSent', String(e)));
            else sent = true;
          });
          const timer = setTimeout(
            () => fail(new DeviceError(sent ? 'timeout' : 'notSent', `No reply from ${host}`)),
            timeoutMs,
          );
          onClose(() => clearTimeout(timer));
        },
        () => new DeviceError(sent ? 'timeout' : 'notSent', 'Socket error'),
      );
    },
  };
}
