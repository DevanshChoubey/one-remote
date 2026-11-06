import {
  PacketReader,
  encodeConnack,
  encodePingresp,
  encodePublish,
  encodeSuback,
  utf8Decode,
} from '../mqtt/codec';
import type { Packet } from '../mqtt/codec';
import { CloudNetError } from '../net';
import type { CloudNet, CloudRequest, CloudResponse, CloudStream } from '../net';

/** A fake MQTT broker that speaks real MQTT bytes, decoded with the app's own codec. */
export interface FakeBroker {
  /** Every CONNECT seen, accepted or not. */
  readonly connects: Extract<Packet, { type: 'connect' }>[];
  /** Every PUBLISH a client sent, decoded as text. */
  readonly published: { topic: string; text: string }[];
  /** Topic filters subscribed on open sessions. */
  readonly subscriptions: string[];
  /** Number of sessions open now. */
  readonly openSessions: number;
  /** Which username/password pairs CONNACK 0; others get 5 (not authorised). */
  accept: (username?: string, password?: string) => boolean;
  /** When true, CONNECT gets no CONNACK (a stalled broker). */
  silent: boolean;
  /** When false, PINGREQ goes unanswered (a half-dead connection). */
  answerPings: boolean;
  /** Sends a message to every session subscribed to a matching filter. */
  send(topic: string, text: string): void;
  /** Ends every session from the broker's side. */
  dropAll(): void;
}

export interface FakeHttp {
  readonly requests: CloudRequest[];
  /** `METHOD url` → handler. A request with no route gets 404. */
  route(method: CloudRequest['method'], url: string, h: (req: CloudRequest) => CloudResponse): void;
  /** When set, every request rejects with this. */
  failWith: CloudNetError | null;
}

export interface FakeCloud {
  net: CloudNet;
  broker: FakeBroker;
  http: FakeHttp;
  /** TLS opens seen, as `host:port`. */
  readonly tlsOpens: string[];
  /** When set, openTls rejects with this. */
  tlsFailWith: CloudNetError | null;
}

/** MQTT topic filter matching (`+` one level, `#` the rest). */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

interface Session {
  filters: string[];
  toClient: (b: Uint8Array) => void;
  end: () => void;
}

export function createFakeCloud(): FakeCloud {
  const sessions = new Set<Session>();
  const routes = new Map<string, (req: CloudRequest) => CloudResponse>();

  const broker: FakeBroker = {
    connects: [],
    published: [],
    get subscriptions() {
      return [...sessions].flatMap((s) => s.filters);
    },
    get openSessions() {
      return sessions.size;
    },
    accept: () => true,
    silent: false,
    answerPings: true,
    send(topic, text) {
      for (const s of sessions) {
        if (s.filters.some((f) => topicMatches(f, topic))) {
          s.toClient(encodePublish({ topic, payload: text, qos: 0 }));
        }
      }
    },
    dropAll() {
      [...sessions].forEach((s) => s.end());
    },
  };

  const http: FakeHttp = {
    requests: [],
    failWith: null,
    route(method, url, h) {
      routes.set(`${method} ${url}`, h);
    },
  };

  const cloud: FakeCloud = {
    broker,
    http,
    tlsOpens: [],
    tlsFailWith: null,
    net: {
      async request(req) {
        http.requests.push(req);
        if (http.failWith) throw http.failWith;
        const h = routes.get(`${req.method} ${req.url}`);
        return h ? h(req) : { status: 404, body: '' };
      },
      async openTls(host, port) {
        cloud.tlsOpens.push(`${host}:${port}`);
        if (cloud.tlsFailWith) throw cloud.tlsFailWith;
        return openSession();
      },
    },
  };

  /** A client stream whose far end is the broker. Data is delivered asynchronously, as sockets do. */
  const openSession = (): CloudStream => {
    const reader = new PacketReader();
    let dataCb: ((b: Uint8Array) => void) | undefined;
    let closeCb: (() => void) | undefined;
    let closed = false;
    const session: Session = {
      filters: [],
      toClient: (b) => {
        // Not queueMicrotask: Jest's fake timers would hold it.
        void Promise.resolve().then(() => {
          if (!closed) dataCb?.(b);
        });
      },
      end: () => {
        if (closed) return;
        closed = true;
        sessions.delete(session);
        void Promise.resolve().then(() => closeCb?.());
      },
    };

    const onPacket = (p: Packet): void => {
      switch (p.type) {
        case 'connect': {
          broker.connects.push(p);
          if (broker.silent) return;
          if (!broker.accept(p.username, p.password)) {
            session.toClient(encodeConnack(false, 5));
            return;
          }
          sessions.add(session);
          session.toClient(encodeConnack(false, 0));
          return;
        }
        case 'subscribe':
          session.filters.push(...p.topics.map((t) => t.topic));
          session.toClient(
            encodeSuback(
              p.packetId,
              p.topics.map((t) => t.qos),
            ),
          );
          return;
        case 'publish':
          broker.published.push({ topic: p.topic, text: utf8Decode(p.payload) });
          return;
        case 'pingreq':
          if (broker.answerPings) session.toClient(encodePingresp());
          return;
        case 'disconnect':
          closed = true;
          sessions.delete(session);
          return;
        default:
          return;
      }
    };

    return {
      write(bytes) {
        if (closed) throw new CloudNetError('failed', 'closed');
        reader.push(bytes).forEach(onPacket);
      },
      close() {
        closed = true;
        sessions.delete(session);
      },
      onData(cb) {
        dataCb = cb;
      },
      onClose(cb) {
        closeCb = cb;
      },
    };
  };

  return cloud;
}
