import { DeviceError } from '@/core';
import type { TvTransport } from '@/tv/transport';
import { infoUrl } from './url';

export interface SamsungInfo {
  name: string;
  model?: string;
  mac?: string;
  power: 'on' | 'standby';
}

const MAC_RE = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The TV's `GET /api/v2/` page. Null unless it is JSON with a `device` object that has a string
 *  `modelName` or a `type` starting with "Samsung" (a router or NAS on 8001 is not a TV). */
export function parseInfo(body: string): SamsungInfo | null {
  let m: unknown;
  try {
    m = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(m) || !isRecord(m.device)) return null;
  const d = m.device;
  const model = typeof d.modelName === 'string' ? d.modelName : undefined;
  const samsungType = typeof d.type === 'string' && d.type.startsWith('Samsung');
  if (model === undefined && !samsungType) return null;
  const name = typeof d.name === 'string' && d.name.trim() ? d.name : 'Samsung TV';
  const mac =
    typeof d.wifiMac === 'string' && MAC_RE.test(d.wifiMac)
      ? d.wifiMac.toLowerCase().replace(/-/g, ':')
      : undefined;
  return {
    name,
    ...(model === undefined ? {} : { model }),
    ...(mac === undefined ? {} : { mac }),
    // Older firmware omits PowerState: it answers only when on.
    power: d.PowerState === 'standby' ? 'standby' : 'on',
  };
}

/** Reads the info page. Rejects DeviceError('notSent') for a non-200 or a page that is not a
 *  Samsung TV's; transport errors pass through unchanged. */
export async function fetchInfo(
  t: Pick<TvTransport, 'request'>,
  host: string,
  timeoutMs = 1500,
): Promise<SamsungInfo> {
  const res = await t.request({ method: 'GET', url: infoUrl(host), timeoutMs });
  if (res.status !== 200) {
    throw new DeviceError('notSent', `info page answered ${String(res.status)}`);
  }
  const info = parseInfo(res.body);
  if (!info) throw new DeviceError('notSent', 'not a Samsung TV info page');
  return info;
}
