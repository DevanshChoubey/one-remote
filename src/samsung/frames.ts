/** Base64 of the UTF-8 bytes of `text`. */
export function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** One key press on the remote-control channel. */
export function keyFrame(keyName: string): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: keyName, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

/** Text for the TV's open text field. Whether the TV appends or replaces is confirmed on the
 *  first Samsung run. */
export function textFrame(text: string): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: {
      Cmd: utf8Base64(text),
      DataOfCmd: 'base64',
      Option: 'true',
      TypeOfRemote: 'SendInputString',
    },
  });
}

export type SamsungEvent =
  | { event: 'ms.channel.connect'; token: string }
  | { event: 'ms.channel.unauthorized' }
  | { event: 'ms.channel.timeout' }
  | { event: 'ms.error'; message: string }
  | { event: 'other' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One message from the TV. Null when it is not JSON or has no `event`. The TV spells the
 *  timeout `ms.channel.timeOut`; both spellings are read. */
export function parseEvent(text: string): SamsungEvent | null {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(m) || typeof m.event !== 'string') return null;
  const data = isRecord(m.data) ? m.data : {};
  switch (m.event.toLowerCase()) {
    case 'ms.channel.connect':
      return {
        event: 'ms.channel.connect',
        token: typeof data.token === 'string' ? data.token : '',
      };
    case 'ms.channel.unauthorized':
      return { event: 'ms.channel.unauthorized' };
    case 'ms.channel.timeout':
      return { event: 'ms.channel.timeout' };
    case 'ms.error':
      return { event: 'ms.error', message: typeof data.message === 'string' ? data.message : '' };
    default:
      return { event: 'other' };
  }
}
