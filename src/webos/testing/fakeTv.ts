import { URI, type SsapIn, type SsapOut } from '../ssap';
import type { TvSocket } from '../transport';

export interface FakeTv {
  host: string;
  mac: string;
  /** Button names written to the pointer socket, in order. */
  buttons: string[];
  /** Every request and subscribe the TV received. */
  requests: { uri: string; payload?: object }[];
  /** Every SSAP frame the TV received, including register and unsubscribe. */
  frames: SsapOut[];
  setVolume(v: number, muted?: boolean): void;
  setApp(appId: string): void;
  setPower(on: boolean): void;
  /** Push a raw power state ('Active', 'Active Standby', ...) to power subscribers. */
  setPowerState(state: string): void;
  /** Close every open socket from the TV's side. */
  drop(): void;
  /** Open sockets stop replying (new ones work). */
  stopAnswering(): void;
  moveTo(host: string): void;
  /** Used by the fake LAN. Null when the TV would refuse this URL. */
  connect(url: string): TvSocket | null;
  /** Used by the fake LAN: the SSDP reply text, or null when the TV is off. */
  ssdpReply(): string | null;
  /** Used by the fake LAN: the port the TV listens on. */
  port(): 3000 | 3001;
  isUp(): boolean;
  /** Keys the TV accepts silently; push to simulate pairing elsewhere. */
  knownKeys: string[];
  /** SHA-256 of the TV's TLS certificate (secure TVs). Change it to simulate a new certificate. */
  certSha256: string;
  /** Open sockets, pointer sockets included. */
  connections(): number;
}

export interface FakeTvOpts {
  host: string;
  mac: string;
  secure?: boolean;
  usn?: string;
  name?: string;
  prompt?: 'allow' | 'deny' | 'never';
  knownKeys?: string[];
  /** Answer these URIs with an SSAP error. */
  failUris?: string[];
  /** Put this host in the pointer socketPath instead of the TV's own. */
  socketHost?: string;
  /** Drop every connection as soon as this URI is requested, without replying. */
  dropOn?: string;
  /** Refuse a register that carries the signed manifest, as 2026 LG firmware does. */
  rejectSigned?: boolean;
  /** SHA-256 of the TV's TLS certificate (default derived from the MAC). */
  certSha256?: string;
}

interface Conn {
  deliver: (text: string) => void;
  closeCbs: (() => void)[];
  registered: boolean;
  muted: boolean;
  closed: boolean;
  subs: Map<string, string>;
  pointer: boolean;
}

const LAUNCH_POINTS = [
  { id: 'netflix', title: 'Netflix' },
  { id: 'youtube.leanback.v4', title: 'YouTube' },
  { id: 'com.webos.app.home', title: 'Home' },
];

const INPUTS = [
  { id: 'HDMI_1', label: 'HDMI 1', port: 1, appId: 'com.webos.app.hdmi1', connected: true },
  { id: 'HDMI_2', label: 'PlayStation', port: 2, appId: 'com.webos.app.hdmi2', connected: false },
];

function decodeOut(text: string): SsapOut | null {
  try {
    const m: unknown = JSON.parse(text);
    if (typeof m !== 'object' || m === null) return null;
    const t = (m as { type?: unknown }).type;
    return t === 'register' || t === 'request' || t === 'subscribe' || t === 'unsubscribe'
      ? (m as SsapOut)
      : null;
  } catch {
    return null;
  }
}

export function createFakeTv(opts: FakeTvOpts): FakeTv {
  const secure = opts.secure ?? false;
  const prompt = opts.prompt ?? 'allow';
  const knownKeys = [...(opts.knownKeys ?? [])];
  const usn = opts.usn ?? `uuid:fake-${opts.mac.replace(/:/g, '')}`;
  const name = opts.name ?? '[LG] webOS TV OLED55C4';
  let keyCount = 0;
  let host = opts.host;
  let up = true;
  let volume = 10;
  let muted = false;
  let appId = 'com.webos.app.home';
  const conns = new Set<Conn>();

  const buttons: string[] = [];
  const requests: { uri: string; payload?: object }[] = [];
  const frames: SsapOut[] = [];

  const reply = (c: Conn, m: SsapIn): void => {
    const text = JSON.stringify(m);
    void Promise.resolve().then(() => {
      if (!c.closed) c.deliver(text);
    });
  };

  const powerPayload = (): Record<string, unknown> => ({
    returnValue: true,
    state: up ? 'Active' : 'Active Standby',
  });
  const volumePayload = (): Record<string, unknown> => ({
    returnValue: true,
    volumeStatus: { volume, muteStatus: muted },
  });
  const foregroundPayload = (): Record<string, unknown> => ({ returnValue: true, appId });

  const payloadFor = (uri: string): Record<string, unknown> | null => {
    switch (uri) {
      case URI.pointer:
        return {
          returnValue: true,
          socketPath: `${secure ? 'wss' : 'ws'}://${opts.socketHost ?? host}:${secure ? 3001 : 3000}/resources/fake/netinput.pointer.sock`,
        };
      case URI.turnOff:
      case URI.switchInput:
      case URI.insertText:
      case URI.launch:
        return { returnValue: true };
      case URI.volume:
        return volumePayload();
      case URI.foreground:
        return foregroundPayload();
      case URI.inputs:
        return { returnValue: true, devices: INPUTS };
      case URI.launchPoints:
        return { returnValue: true, launchPoints: LAUNCH_POINTS };
      case URI.power:
        return powerPayload();
      case URI.netInfo:
        return {
          returnValue: true,
          wifi: { state: 'connected' },
          wifiInfo: { macAddress: opts.mac.toUpperCase() },
        };
      default:
        return null;
    }
  };

  const push = (uri: string, payload: Record<string, unknown>): void => {
    for (const c of conns) {
      if (c.muted) continue;
      for (const [id, subUri] of c.subs) {
        if (subUri === uri) reply(c, { type: 'response', id, payload });
      }
    }
  };

  const issueKey = (): string => {
    keyCount += 1;
    const key = `fake-key-${keyCount}`;
    knownKeys.push(key);
    return key;
  };

  const handle = (c: Conn, text: string): void => {
    if (c.muted) return;
    if (c.pointer) {
      const m = /^type:button\nname:(.+)\n\n$/.exec(text);
      if (m?.[1]) buttons.push(m[1]);
      return;
    }
    const m = decodeOut(text);
    if (!m) return;
    frames.push(m);
    if (m.type === 'register') {
      if (opts.rejectSigned && 'signatures' in m.payload.manifest) {
        reply(c, {
          type: 'error',
          id: m.id,
          error: '403 Pairing rejected: blacklisted certificate detected',
          payload: {},
        });
        return;
      }
      const key = m.payload['client-key'];
      if (key !== undefined && knownKeys.includes(key)) {
        c.registered = true;
        reply(c, { type: 'registered', id: m.id, payload: { 'client-key': key } });
        return;
      }
      reply(c, {
        type: 'response',
        id: m.id,
        payload: { pairingType: 'PROMPT', returnValue: true },
      });
      if (prompt === 'allow') {
        c.registered = true;
        reply(c, { type: 'registered', id: m.id, payload: { 'client-key': issueKey() } });
      } else if (prompt === 'deny') {
        reply(c, { type: 'error', id: m.id, error: '403 User denied access', payload: {} });
      }
      return;
    }
    if (m.type === 'unsubscribe') {
      c.subs.delete(m.id);
      return;
    }
    requests.push(m.payload === undefined ? { uri: m.uri } : { uri: m.uri, payload: m.payload });
    if (opts.dropOn === m.uri) {
      dropAll();
      return;
    }
    if (!c.registered) {
      reply(c, { type: 'error', id: m.id, error: '401 insufficient permissions', payload: {} });
      return;
    }
    const payload = opts.failUris?.includes(m.uri) ? null : payloadFor(m.uri);
    if (!payload) {
      reply(c, { type: 'error', id: m.id, error: '404 no such service or method', payload: {} });
      return;
    }
    if (m.type === 'subscribe') c.subs.set(m.id, m.uri);
    if (
      m.uri === URI.launch &&
      m.payload &&
      'id' in m.payload &&
      typeof m.payload.id === 'string'
    ) {
      appId = m.payload.id;
    }
    reply(c, {
      type: 'response',
      id: m.id,
      payload: m.type === 'subscribe' ? { ...payload, subscribed: true } : payload,
    });
  };

  const makeSocket = (pointer: boolean): TvSocket => {
    let onMessage: ((t: string) => void) | undefined;
    const backlog: string[] = [];
    const c: Conn = {
      deliver: (t) => (onMessage ? onMessage(t) : backlog.push(t)),
      closeCbs: [],
      registered: false,
      muted: false,
      closed: false,
      subs: new Map(),
      pointer,
    };
    conns.add(c);
    return {
      send: (text) => {
        if (c.closed) throw new Error('socket closed');
        handle(c, text);
      },
      close: () => {
        c.closed = true;
        conns.delete(c);
      },
      onMessage: (cb) => {
        onMessage = cb;
        backlog.splice(0).forEach(cb);
      },
      onClose: (cb) => {
        c.closeCbs.push(cb);
      },
    };
  };

  const dropAll = (): void => {
    for (const c of [...conns]) {
      c.closed = true;
      conns.delete(c);
      c.closeCbs.forEach((cb) => cb());
    }
  };

  return {
    get host() {
      return host;
    },
    set host(h: string) {
      host = h;
    },
    mac: opts.mac,
    buttons,
    requests,
    frames,
    setVolume: (v, m) => {
      volume = v;
      if (m !== undefined) muted = m;
      push(URI.volume, volumePayload());
    },
    setApp: (id) => {
      appId = id;
      push(URI.foreground, foregroundPayload());
    },
    setPower: (on) => {
      up = on;
      if (on) push(URI.power, powerPayload());
      else dropAll();
    },
    setPowerState: (state) => push(URI.power, { returnValue: true, state }),
    drop: dropAll,
    stopAnswering: () => {
      for (const c of conns) c.muted = true;
    },
    moveTo: (h) => {
      host = h;
      dropAll();
    },
    knownKeys,
    certSha256: opts.certSha256 ?? `cert-${opts.mac.replace(/:/g, '')}`,
    isUp: () => up,
    connections: () => conns.size,
    port: () => (secure ? 3001 : 3000),
    ssdpReply: () =>
      up
        ? [
            'HTTP/1.1 200 OK',
            'CACHE-CONTROL: max-age=1800',
            'ST: urn:lge-com:service:webos-second-screen:1',
            `USN: ${usn}::urn:lge-com:service:webos-second-screen:1`,
            `DLNADeviceName.lge.com: ${encodeURIComponent(name)}`,
            '',
            '',
          ].join('\r\n')
        : null,
    connect: (url) => {
      const m = /^(wss?):\/\/([^/:]+):(\d+)(\/.*)?$/.exec(url);
      if (!m || !up) return null;
      const [, scheme, h, port, path] = m;
      if (h !== host) return null;
      if (secure ? scheme !== 'wss' || port !== '3001' : scheme !== 'ws' || port !== '3000') {
        return null;
      }
      if (path === undefined || path === '/') return makeSocket(false);
      return path === '/resources/fake/netinput.pointer.sock' ? makeSocket(true) : null;
    },
  };
}
