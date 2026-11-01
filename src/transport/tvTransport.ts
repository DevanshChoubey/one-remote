import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type {
  TvHttpRequest,
  TvHttpResponse,
  TvIdentity,
  TvSocket,
  TvStream,
  TvTls,
  TvTransport,
} from '@/tv/transport';
import { parseSocketUrl } from '@/webos/url';
import {
  assertLocal,
  isAllowedMulticast,
  isLocalAddress,
  isSubnetBroadcast,
  type Prefix,
} from './localOnly';
import { getOnLinkPrefixes, subnetBroadcast, subnetHosts } from './netInfo';
import {
  LAN_ERRORS,
  lanSocket,
  type LanCloseEvent,
  type LanDataEvent,
  type LanMessageEvent,
  type LanServiceEvent,
  type LanSocketNative,
  type LanStreamOpenResult,
} from '../../modules/lan-socket';

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const WOL_PORT = 9;
const PROBE_IN_FLIGHT = 32;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

interface Datagram {
  on(event: 'message', cb: (msg: unknown, rinfo: { address: string }) => void): unknown;
  on(event: 'error', cb: (e: unknown) => void): unknown;
  once(event: 'listening', cb: () => void): unknown;
  bind(port: number): void;
  send(
    msg: string | unknown[],
    /** Must be undefined when `msg` is an array: react-native-udp throws otherwise. */
    offset: number | undefined,
    length: number | undefined,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void;
  setBroadcast(flag: boolean): void;
  close(): void;
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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** Standard base64 as the native module sends it; characters outside the alphabet are skipped. */
function fromBase64(text: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) continue;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

interface Handler {
  message?(text: string): void;
  data?(base64: string): void;
  service?(e: LanServiceEvent): void;
  close(why: string): void;
}

/** Routes the native module's events to the socket or stream they belong to. Subscribes on first
 *  use. */
interface Router {
  add(id: string, h: Handler): void;
  remove(id: string): void;
}

function createRouter(lan: () => LanSocketNative): Router {
  const handlers = new Map<string, Handler>();
  let subscribed = false;
  return {
    add(id, h) {
      if (!subscribed) {
        subscribed = true;
        const native = lan();
        native.addListener('message', (e: LanMessageEvent) =>
          handlers.get(e.id)?.message?.(e.data),
        );
        native.addListener('data', (e: LanDataEvent) => handlers.get(e.id)?.data?.(e.base64));
        native.addListener('service', (e: LanServiceEvent) => handlers.get(e.id)?.service?.(e));
        native.addListener('close', (e: LanCloseEvent) => {
          const h2 = handlers.get(e.id);
          handlers.delete(e.id);
          h2?.close(
            e.error ?? `closed (${String(e.code ?? '?')}${e.reason ? ` ${e.reason}` : ''})`,
          );
        });
      }
      handlers.set(id, h);
    },
    remove(id) {
      handlers.delete(id);
    },
  };
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function errorCode(e: unknown): string | undefined {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Maps a native open rejection to a DeviceError that keeps the native text. */
function openError(target: string, e: unknown): DeviceError {
  const why = `cannot open ${target}: ${errorText(e)}`;
  switch (errorCode(e)) {
    case LAN_ERRORS.pinMismatch:
    case LAN_ERRORS.noTrust:
      return new DeviceError('notPaired', why);
    case LAN_ERRORS.notLocal:
      return new DeviceError('notLocal', why);
    default:
      return new DeviceError('notSent', why);
  }
}

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `${nextId.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Opens one native socket. Rejects after `timeoutMs` (cancelling the native open). */
function openLan(
  lan: () => LanSocketNative,
  router: Router,
  url: string,
  timeoutMs: number,
  tls: TvTls,
  probe = false,
): Promise<TvSocket> {
  return new Promise<TvSocket>((resolve, reject) => {
    const id = newId();
    let settled = false;
    let closedByUs = false;
    let ended = false;
    let onMessage: ((t: string) => void) | undefined;
    const backlog: string[] = [];
    const closeCbs: (() => void)[] = [];
    const native = lan();
    const cancel = (): void => {
      router.remove(id);
      try {
        native.close(id);
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cancel();
      reject(new DeviceError('notSent', `timed out opening ${url}`));
    }, timeoutMs);
    router.add(id, {
      message: (text) => {
        if (onMessage) onMessage(text);
        else backlog.push(text);
      },
      close: () => {
        ended = true;
        if (settled && !closedByUs) closeCbs.forEach((cb) => cb());
      },
    });
    const opts = {
      timeoutMs,
      ...(tls.pinSha256 ? { pinSha256: tls.pinSha256 } : {}),
      ...(tls.pairing ? { pairing: true } : {}),
      ...(probe ? { probe: true } : {}),
    };
    let opening: Promise<{ certSha256?: string }>;
    try {
      opening = native.open(id, url, opts);
    } catch (e) {
      opening = Promise.reject(e);
    }
    opening.then(
      (r) => {
        if (settled) {
          cancel();
          return;
        }
        settled = true;
        clearTimeout(timer);
        const sock: TvSocket = {
          ...(r.certSha256 ? { certSha256: r.certSha256 } : {}),
          send: (t) => {
            if (ended) throw new DeviceError('notSent', 'socket closed');
            try {
              native.send(id, t);
            } catch (e) {
              throw notSent(e);
            }
          },
          close: () => {
            if (closedByUs) return;
            closedByUs = true;
            cancel();
          },
          onMessage: (cb) => {
            onMessage = cb;
            backlog.splice(0).forEach(cb);
          },
          onClose: (cb) => {
            closeCbs.push(cb);
            // The native close may have arrived before this promise resolved.
            if (ended && !closedByUs)
              void Promise.resolve().then(() => {
                if (!closedByUs) cb();
              });
          },
        };
        resolve(sock);
      },
      (e: unknown) => {
        router.remove(id);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(openError(url, e));
      },
    );
  });
}

/** Opens one native TLS stream. Rejects after `timeoutMs` (cancelling the native open). */
function openLanStream(
  lan: () => LanSocketNative,
  router: Router,
  host: string,
  port: number,
  timeoutMs: number,
  tls: TvTls & { identity?: string },
): Promise<TvStream> {
  const target = `${host.includes(':') ? `[${host}]` : host}:${String(port)}`;
  return new Promise<TvStream>((resolve, reject) => {
    const id = newId();
    let settled = false;
    let closedByUs = false;
    let ended = false;
    let onData: ((b: Uint8Array) => void) | undefined;
    const backlog: Uint8Array[] = [];
    const closeCbs: (() => void)[] = [];
    const native = lan();
    const cancel = (): void => {
      router.remove(id);
      try {
        native.close(id);
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cancel();
      reject(new DeviceError('notSent', `timed out opening ${target}`));
    }, timeoutMs);
    router.add(id, {
      data: (base64) => {
        const bytes = fromBase64(base64);
        if (onData) onData(bytes);
        else backlog.push(bytes);
      },
      close: () => {
        ended = true;
        if (settled && !closedByUs) closeCbs.forEach((cb) => cb());
      },
    });
    const opts = {
      timeoutMs,
      ...(tls.pinSha256 ? { pinSha256: tls.pinSha256 } : {}),
      ...(tls.pairing ? { pairing: true } : {}),
      ...(tls.identity ? { identity: tls.identity } : {}),
    };
    let opening: Promise<LanStreamOpenResult>;
    try {
      opening = native.openStream(id, host, port, opts);
    } catch (e) {
      opening = Promise.reject(e);
    }
    opening.then(
      (r) => {
        if (settled) {
          cancel();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          certSha256: r.certSha256,
          serverModulusHex: r.serverModulusHex,
          serverExponentHex: r.serverExponentHex,
          serverSubject: r.serverSubject,
          write: (bytes) => {
            if (ended || closedByUs) throw new DeviceError('notSent', 'stream closed');
            try {
              native.write(id, toBase64(bytes));
            } catch (e) {
              throw notSent(e);
            }
          },
          close: () => {
            if (closedByUs) return;
            closedByUs = true;
            cancel();
          },
          onData: (cb) => {
            onData = cb;
            backlog.splice(0).forEach(cb);
          },
          onClose: (cb) => {
            closeCbs.push(cb);
            // The native close may have arrived before this promise resolved.
            if (ended && !closedByUs)
              void Promise.resolve().then(() => {
                if (!closedByUs) cb();
              });
          },
        });
      },
      (e: unknown) => {
        router.remove(id);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(openError(target, e));
      },
    );
  });
}

/** `TvTransport` over the `lan-socket` native module and `react-native-udp`. Every unicast connect
 *  goes through `assertLocal()` (and the native side refuses any host that is not a literal local
 *  IP). Nothing is opened, and no native module is loaded, until first use. */
export function createRnTvTransport(
  deps: { prefixes?: () => Promise<Prefix[]>; lan?: () => LanSocketNative } = {},
): TvTransport {
  const prefixes = deps.prefixes ?? getOnLinkPrefixes;
  const lan = deps.lan ?? lanSocket;
  const router = createRouter(lan);

  return {
    async open(url: string, timeoutMs: number, tls: TvTls = {}): Promise<TvSocket> {
      const parsed = parseSocketUrl(url);
      if (!parsed) throw new DeviceError('notLocal', 'Not a plain ws:// or wss:// address');
      assertLocal(parsed.host, await prefixes());
      if (url.startsWith('wss:') && !tls.pinSha256 && !tls.pairing) {
        // Never connect unpinned outside pairing.
        throw new DeviceError('notPaired', `No pinned certificate for ${url}`);
      }
      return openLan(lan, router, url, timeoutMs, tls);
    },

    async openStream(host, port, timeoutMs, tls): Promise<TvStream> {
      assertLocal(host, await prefixes());
      if (!tls.pinSha256 && !tls.pairing) {
        // Never connect unpinned outside pairing.
        throw new DeviceError('notPaired', `No pinned certificate for ${host}:${String(port)}`);
      }
      return openLanStream(lan, router, host, port, timeoutMs, tls);
    },

    async ensureIdentity(ref, commonName): Promise<TvIdentity> {
      try {
        const { modulusHex, exponentHex } = await lan().ensureIdentity(ref, commonName);
        return { modulusHex, exponentHex };
      } catch (e) {
        throw openError(`client identity '${ref}'`, e);
      }
    },

    async deleteIdentity(ref): Promise<void> {
      try {
        await lan().deleteIdentity(ref);
      } catch (e) {
        throw openError(`client identity '${ref}'`, e);
      }
    },

    async request(req: TvHttpRequest): Promise<TvHttpResponse> {
      const secure = req.url.startsWith('https:');
      if (!secure && !req.url.startsWith('http:')) {
        throw new DeviceError('notLocal', 'Not a plain http:// or https:// address');
      }
      const parsed = parseSocketUrl(req.url.replace(/^http/, 'ws'));
      if (!parsed) throw new DeviceError('notLocal', 'Not a plain http:// or https:// address');
      assertLocal(parsed.host, await prefixes());
      if (secure && !req.pinSha256 && !req.pairing) {
        // Never connect unpinned outside pairing.
        throw new DeviceError('notPaired', `No pinned certificate for ${req.url}`);
      }
      const max = req.maxBytes;
      if (max !== undefined && !(Number.isInteger(max) && max >= 1 && max <= MAX_RESPONSE_BYTES)) {
        throw new DeviceError(
          'notSent',
          `maxBytes must be an integer from 1 to ${String(MAX_RESPONSE_BYTES)}`,
        );
      }
      try {
        return await lan().request(req);
      } catch (e) {
        throw openError(req.url, e);
      }
    },

    async ssdpSearch(message, windowMs, onReply): Promise<void> {
      // iOS needs the multicast entitlement for SSDP; it uses the subnet probe only.
      if (Platform.OS === 'ios') return;
      if (!isAllowedMulticast(SSDP_ADDRESS)) throw new DeviceError('notLocal');
      const local = await prefixes();
      await withSocket<void>((sock, done, fail) => {
        sock.on('message', (msg, rinfo) => {
          // Only the home network answers us.
          if (isLocalAddress(rinfo.address, local)) onReply(text(msg), rinfo.address);
        });
        sock.send(message, 0, message.length, SSDP_PORT, SSDP_ADDRESS, (e) => {
          if (e) fail(notSent(e));
        });
        const timer = setTimeout(() => done(undefined), windowMs);
        return () => clearTimeout(timer);
      });
    },

    async mdnsBrowse(serviceType, windowMs, onService): Promise<void> {
      const id = newId();
      let stopped = false;
      let native: LanSocketNative | undefined;
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        router.remove(id);
        try {
          native?.stopBrowse(id);
        } catch {
          // already gone
        }
      };
      try {
        const local = await prefixes();
        native = lan();
        router.add(id, {
          // Defence in depth: native already drops non-local hosts.
          service: (e) => {
            if (isLocalAddress(e.host, local)) {
              onService({ name: e.name, host: e.host, port: e.port, txt: e.txt });
            }
          },
          close: () => undefined,
        });
        native.browse(id, serviceType);
      } catch (e) {
        stop();
        throw notSent(e);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, windowMs));
      stop();
    },

    async probe(ports, perHostMs, onOpen, isCancelled, onHost): Promise<void> {
      const local = await prefixes();
      const hosts = [...new Set(local.flatMap(subnetHosts))];
      const tryPort = async (host: string, port: number): Promise<boolean> => {
        try {
          assertLocal(host, local);
          // Only checks that the socket opens (nothing is sent), so TLS is tried as if pairing.
          const secure = port === 3001;
          const sock = await openLan(
            lan,
            router,
            `${secure ? 'wss' : 'ws'}://${host}:${port}`,
            perHostMs,
            secure ? { pairing: true } : {},
            true,
          );
          sock.close();
          onOpen(host, port);
          return true;
        } catch {
          // closed, refused or silent: not a TV
          return false;
        }
      };
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < hosts.length && !isCancelled?.()) {
          const host = hosts[next++];
          if (!host) continue;
          const results = await Promise.all(ports.map((p) => tryPort(host, p)));
          const openPorts = ports.filter((_, i) => results[i]);
          if (openPorts.length > 0) {
            try {
              onHost?.(host, openPorts);
            } catch {
              // a listener failing never stops the sweep
            }
          }
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
          sock.send(Array.from(packet), undefined, undefined, WOL_PORT, address, (e) => {
            if (e) fail(notSent(e));
            else if (--left === 0) done(undefined);
          });
        }
      });
    },

    onWifi: async (): Promise<boolean> => (await prefixes()).length > 0,
  };
}
