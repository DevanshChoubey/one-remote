import { ProtoWriter, bool, int32, readFields, str, sub, uint } from './proto';
import type { FieldMap } from './proto';

/** Pairing (port 6467) and remote (port 6466) messages of Google's Android TV Remote Service v2.
 *  Field numbers follow tronikos/androidtvremote2 (Apache-2.0). Encoders return unframed bytes. */

export const STATUS_OK = 200;
const PROTOCOL_VERSION = 2;

// OuterMessage fields, pairing.
const PAIRING_REQUEST = 10;
const PAIRING_REQUEST_ACK = 11;
const OPTIONS = 20;
const CONFIGURATION = 30;
const CONFIGURATION_ACK = 31;
const SECRET = 40;
const SECRET_ACK = 41;

// RemoteMessage fields.
const REMOTE_CONFIGURE = 1;
const REMOTE_SET_ACTIVE = 2;
const REMOTE_ERROR = 3;
const REMOTE_PING_REQUEST = 8;
const REMOTE_PING_RESPONSE = 9;
const REMOTE_KEY_INJECT = 10;
const REMOTE_IME_KEY_INJECT = 20;
const REMOTE_IME_BATCH_EDIT = 21;
const REMOTE_START = 40;
const REMOTE_SET_VOLUME_LEVEL = 50;

/** The RemoteMessage fields this client reads. Others decode as `other`. */
const KNOWN_REMOTE = new Set([
  REMOTE_CONFIGURE,
  REMOTE_SET_ACTIVE,
  REMOTE_ERROR,
  REMOTE_PING_REQUEST,
  REMOTE_START,
  REMOTE_SET_VOLUME_LEVEL,
  REMOTE_IME_KEY_INJECT,
  REMOTE_IME_BATCH_EDIT,
]);

export type PairingOut =
  | { kind: 'pairingRequest'; clientName: string }
  | { kind: 'options' }
  | { kind: 'configuration' }
  | { kind: 'secret'; secret: Uint8Array };

export type PairingIn =
  | { kind: 'pairingRequestAck'; serverName?: string }
  | { kind: 'options' }
  | { kind: 'configurationAck' }
  | { kind: 'secretAck' }
  | { kind: 'other' };

export type RemoteIn =
  | { kind: 'configure'; features: number; vendor?: string; model?: string }
  | { kind: 'setActive' }
  | { kind: 'ping'; val1: number }
  | { kind: 'start'; started: boolean }
  | { kind: 'volume'; level: number; max: number; muted: boolean }
  | { kind: 'imeKeyInject'; appPackage?: string }
  | { kind: 'imeBatchEdit'; imeCounter: number; fieldCounter: number }
  | { kind: 'error' }
  | { kind: 'other' };

export type RemoteOut =
  | { kind: 'configure'; features: number }
  | { kind: 'setActive'; active: number }
  | { kind: 'pong'; val1: number }
  | { kind: 'key'; code: number; direction: 3 }
  | { kind: 'imeText'; imeCounter: number; fieldCounter: number; text: string };

function outer(field: number, body: ProtoWriter): Uint8Array {
  return new ProtoWriter()
    .varint(1, PROTOCOL_VERSION)
    .varint(2, STATUS_OK)
    .message(field, body)
    .finish();
}

/** Input encoding: HEX symbols (type 3), six symbols long. */
function hexEncoding(): ProtoWriter {
  return new ProtoWriter().varint(1, 3).varint(2, 6);
}

export function encodePairing(m: PairingOut): Uint8Array {
  switch (m.kind) {
    case 'pairingRequest':
      return outer(
        PAIRING_REQUEST,
        new ProtoWriter().string(1, 'atvremote').string(2, m.clientName),
      );
    case 'options':
      return outer(OPTIONS, new ProtoWriter().message(1, hexEncoding()).varint(3, 1));
    case 'configuration':
      return outer(CONFIGURATION, new ProtoWriter().message(1, hexEncoding()).varint(2, 1));
    case 'secret':
      return outer(SECRET, new ProtoWriter().bytes(1, m.secret));
  }
}

export function decodePairing(b: Uint8Array): { status: number; msg: PairingIn } {
  const f: FieldMap = readFields(b);
  const status = int32(f, 2) ?? 0;
  if (f.has(PAIRING_REQUEST_ACK)) {
    const body = sub(f, PAIRING_REQUEST_ACK);
    const serverName = body ? str(body, 1) : undefined;
    return {
      status,
      msg:
        serverName === undefined
          ? { kind: 'pairingRequestAck' }
          : { kind: 'pairingRequestAck', serverName },
    };
  }
  if (f.has(OPTIONS)) return { status, msg: { kind: 'options' } };
  if (f.has(CONFIGURATION_ACK)) return { status, msg: { kind: 'configurationAck' } };
  if (f.has(SECRET_ACK)) return { status, msg: { kind: 'secretAck' } };
  return { status, msg: { kind: 'other' } };
}

export function encodeRemote(m: RemoteOut): Uint8Array {
  switch (m.kind) {
    case 'configure': {
      const info = new ProtoWriter()
        .string(1, 'One Remote')
        .string(2, 'One Remote')
        .varint(3, 1)
        .string(4, '1')
        .string(5, 'atvremote')
        .string(6, '1.0.0');
      return new ProtoWriter()
        .message(REMOTE_CONFIGURE, new ProtoWriter().varint(1, m.features).message(2, info))
        .finish();
    }
    case 'setActive':
      return new ProtoWriter()
        .message(REMOTE_SET_ACTIVE, new ProtoWriter().varint(1, m.active))
        .finish();
    case 'pong':
      return new ProtoWriter()
        .message(REMOTE_PING_RESPONSE, new ProtoWriter().varint(1, m.val1))
        .finish();
    case 'key':
      return new ProtoWriter()
        .message(REMOTE_KEY_INJECT, new ProtoWriter().varint(1, m.code).varint(2, m.direction))
        .finish();
    case 'imeText': {
      // The cursor sits after the last character, as the reference client sends it.
      const end = [...m.text].length - 1;
      const status = new ProtoWriter().varint(1, end).varint(2, end).string(3, m.text);
      const editInfo = new ProtoWriter().varint(1, 1).message(2, status);
      return new ProtoWriter()
        .message(
          REMOTE_IME_BATCH_EDIT,
          new ProtoWriter().varint(1, m.imeCounter).varint(2, m.fieldCounter).message(3, editInfo),
        )
        .finish();
    }
  }
}

export function decodeRemote(b: Uint8Array): RemoteIn {
  const f = readFields(b);
  // The first known field in the message wins. Bodies are parsed only for known fields, so an
  // unknown field with odd bytes cannot make the whole message fail.
  for (const n of f.keys()) {
    if (!KNOWN_REMOTE.has(n)) continue;
    const body = sub(f, n);
    switch (n) {
      case REMOTE_CONFIGURE: {
        if (!body) return { kind: 'other' };
        const info = sub(body, 2);
        return {
          kind: 'configure',
          features: uint(body, 1) ?? 0,
          model: info ? str(info, 1) : undefined,
          vendor: info ? str(info, 2) : undefined,
        };
      }
      case REMOTE_SET_ACTIVE:
        return { kind: 'setActive' };
      case REMOTE_ERROR:
        return { kind: 'error' };
      case REMOTE_PING_REQUEST:
        if (!body) return { kind: 'other' };
        return { kind: 'ping', val1: int32(body, 1) ?? 0 };
      case REMOTE_START:
        if (!body) return { kind: 'other' };
        return { kind: 'start', started: bool(body, 1) ?? false };
      case REMOTE_SET_VOLUME_LEVEL:
        if (!body) return { kind: 'other' };
        return {
          kind: 'volume',
          level: int32(body, 7) ?? 0,
          max: int32(body, 6) ?? 0,
          muted: bool(body, 8) ?? false,
        };
      case REMOTE_IME_KEY_INJECT: {
        if (!body) return { kind: 'other' };
        const app = sub(body, 1);
        return { kind: 'imeKeyInject', appPackage: app ? str(app, 12) : undefined };
      }
      case REMOTE_IME_BATCH_EDIT:
        if (!body) return { kind: 'other' };
        return {
          kind: 'imeBatchEdit',
          imeCounter: int32(body, 1) ?? 0,
          fieldCounter: int32(body, 2) ?? 0,
        };
      default:
        break;
    }
  }
  return { kind: 'other' };
}
