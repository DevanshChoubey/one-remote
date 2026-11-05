import type { Unsubscribe } from '@/core';
import type { CloudStream } from '../net';
import {
  MqttProtocolError,
  PacketReader,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePuback,
  encodePublish,
  encodeSubscribe,
  utf8Decode,
} from './codec';
import type { Packet, QoS } from './codec';

/**
 * - `auth`: the broker refused the username or password (CONNACK 4 or 5): sign in again;
 * - `refused`: any other CONNACK refusal, or a refused subscription;
 * - `timeout`: no CONNACK, SUBACK or PINGRESP in time;
 * - `closed`: the stream ended;
 * - `protocol`: the broker sent bytes that are not MQTT.
 */
export type MqttErrorCode = 'auth' | 'refused' | 'timeout' | 'closed' | 'protocol';

export class MqttError extends Error {
  readonly code: MqttErrorCode;
  readonly returnCode?: number;

  constructor(code: MqttErrorCode, message?: string, returnCode?: number) {
    super(message ?? code);
    this.name = 'MqttError';
    this.code = code;
    if (returnCode !== undefined) this.returnCode = returnCode;
    Object.setPrototypeOf(this, MqttError.prototype);
  }
}

export interface MqttConnectOptions {
  stream: CloudStream;
  clientId: string;
  username: string;
  password: string;
  /** Seconds. The client pings at three quarters of it and gives up when a ping goes unanswered. */
  keepAliveS: number;
  /** For the CONNACK and each SUBACK. */
  timeoutMs: number;
}

/** A live MQTT session over one stream. */
export interface MqttConnection {
  readonly open: boolean;
  /** Resolves on SUBACK; rejects MqttError when the broker refuses any of them. */
  subscribe(topics: string[], qos: QoS): Promise<void>;
  /** QoS 0. Throws MqttError('closed') once the session has ended. */
  publish(topic: string, text: string): void;
  onMessage(cb: (topic: string, text: string) => void): Unsubscribe;
  /** Fires once when the session ends for any reason but `close()`. */
  onClose(cb: (error: MqttError) => void): void;
  /** Sends DISCONNECT (best effort) and closes the stream. */
  close(): void;
}

const AUTH_CODES = new Set([4, 5]);

/** Sends CONNECT on an open stream and resolves on CONNACK 0. On failure the stream is closed. */
export function mqttConnect(o: MqttConnectOptions): Promise<MqttConnection> {
  const { stream } = o;
  const reader = new PacketReader();
  const messageCbs = new Set<(topic: string, text: string) => void>();
  const closeCbs: ((e: MqttError) => void)[] = [];
  const pendingSubs = new Map<
    number,
    { resolve: () => void; reject: (e: MqttError) => void; timer: ReturnType<typeof setTimeout> }
  >();
  let nextId = 1;
  let ended = false;
  let connected = false;
  let pingOutstanding = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let connack: ((p: Extract<Packet, { type: 'connack' }>) => void) | undefined;
  let failConnect: ((e: MqttError) => void) | undefined;

  const end = (error: MqttError, notify: boolean): void => {
    if (ended) return;
    ended = true;
    if (pingTimer) clearInterval(pingTimer);
    pendingSubs.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(error);
    });
    pendingSubs.clear();
    try {
      stream.close();
    } catch {
      // Already closed.
    }
    failConnect?.(error);
    if (notify && connected) {
      closeCbs.forEach((cb) => {
        try {
          cb(error);
        } catch (e) {
          console.error('MQTT close listener threw', e);
        }
      });
    }
  };

  const write = (bytes: Uint8Array): void => {
    if (ended) throw new MqttError('closed');
    try {
      stream.write(bytes);
    } catch {
      end(new MqttError('closed'), true);
      throw new MqttError('closed');
    }
  };

  const onPacket = (p: Packet): void => {
    switch (p.type) {
      case 'connack':
        connack?.(p);
        return;
      case 'suback': {
        const pending = pendingSubs.get(p.packetId);
        if (!pending) return;
        pendingSubs.delete(p.packetId);
        clearTimeout(pending.timer);
        if (p.granted.some((g) => g === 0x80)) {
          pending.reject(new MqttError('refused', 'Subscription refused'));
        } else {
          pending.resolve();
        }
        return;
      }
      case 'publish': {
        if (p.qos === 1 && p.packetId !== undefined) {
          try {
            write(encodePuback(p.packetId));
          } catch {
            return;
          }
        }
        const text = utf8Decode(p.payload);
        messageCbs.forEach((cb) => {
          try {
            cb(p.topic, text);
          } catch (e) {
            console.error('MQTT message listener threw', e);
          }
        });
        return;
      }
      case 'pingresp':
        pingOutstanding = false;
        return;
      default:
        // PUBACK for a QoS 1 publish we never send, or a packet a broker must not send: ignore.
        return;
    }
  };

  stream.onData((bytes) => {
    if (ended) return;
    let packets: Packet[];
    try {
      packets = reader.push(bytes);
    } catch (e) {
      end(
        new MqttError('protocol', e instanceof MqttProtocolError ? e.message : 'Bad bytes'),
        true,
      );
      return;
    }
    packets.forEach(onPacket);
  });
  stream.onClose(() => end(new MqttError('closed'), true));

  const connection: MqttConnection = {
    get open() {
      return !ended;
    },
    subscribe: (topics, qos) =>
      new Promise<void>((resolve, reject) => {
        if (ended) {
          reject(new MqttError('closed'));
          return;
        }
        const id = nextId;
        nextId = nextId >= 0xffff ? 1 : nextId + 1;
        const timer = setTimeout(() => {
          pendingSubs.delete(id);
          reject(new MqttError('timeout', 'No SUBACK'));
        }, o.timeoutMs);
        pendingSubs.set(id, { resolve, reject, timer });
        try {
          write(
            encodeSubscribe(
              id,
              topics.map((topic) => ({ topic, qos })),
            ),
          );
        } catch (e) {
          clearTimeout(timer);
          pendingSubs.delete(id);
          reject(e instanceof MqttError ? e : new MqttError('closed'));
        }
      }),
    publish: (topic, text) => {
      write(encodePublish({ topic, payload: text, qos: 0 }));
    },
    onMessage: (cb) => {
      messageCbs.add(cb);
      return () => {
        messageCbs.delete(cb);
      };
    },
    onClose: (cb) => {
      closeCbs.push(cb);
    },
    close: () => {
      if (ended) return;
      try {
        stream.write(encodeDisconnect());
      } catch {
        // Best effort.
      }
      end(new MqttError('closed'), false);
    },
  };

  return new Promise<MqttConnection>((resolve, reject) => {
    const timer = setTimeout(() => end(new MqttError('timeout', 'No CONNACK'), false), o.timeoutMs);
    failConnect = (e) => {
      clearTimeout(timer);
      failConnect = undefined;
      reject(e);
    };
    connack = (p) => {
      clearTimeout(timer);
      connack = undefined;
      failConnect = undefined;
      if (p.returnCode !== 0) {
        const code: MqttErrorCode = AUTH_CODES.has(p.returnCode) ? 'auth' : 'refused';
        const err = new MqttError(code, `CONNACK ${p.returnCode}`, p.returnCode);
        end(err, false);
        reject(err);
        return;
      }
      connected = true;
      const every = Math.max(1, Math.floor(o.keepAliveS * 750));
      pingTimer = setInterval(() => {
        if (pingOutstanding) {
          end(new MqttError('timeout', 'No PINGRESP'), true);
          return;
        }
        pingOutstanding = true;
        try {
          write(encodePingreq());
        } catch {
          // end() already ran.
        }
      }, every);
      resolve(connection);
    };
    try {
      write(
        encodeConnect({
          clientId: o.clientId,
          username: o.username,
          password: o.password,
          keepAlive: o.keepAliveS,
          clean: true,
        }),
      );
    } catch (e) {
      clearTimeout(timer);
      failConnect = undefined;
      reject(e instanceof MqttError ? e : new MqttError('closed'));
    }
  });
}
