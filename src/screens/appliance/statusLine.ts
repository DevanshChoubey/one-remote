import { t } from '@/i18n';
import type { DeviceView } from '@/services';
import type { StatusKind } from '@/ui/appliance';

export type { StatusKind };

/** The line at the bottom of an AC or fan screen: how the last press went out. */
export interface StatusLine {
  kind: StatusKind;
  key: string;
  params?: Record<string, string>;
}

export function statusLine(v: DeviceView): StatusLine {
  const first = v.device.links[0];
  // Same lines for both kinds; the fan's copy says "the fan".
  const ns = v.device.kind === 'fan' ? 'fan' : 'ac';
  const line = (kind: StatusKind, params?: Record<string, string>): StatusLine => ({
    kind,
    key: `${ns}.status.${kind}`,
    ...(params ? { params } : {}),
  });
  if (!v.usable) return line('needsIr');
  if (v.status.via === 'ir') {
    if (v.status.fellBack && first) return line('fellBack', { link: t(`ir.link.${first.kind}`) });
    return line('irOnly');
  }
  // Nothing sent yet: an IR-first device says so; any other link is taken as connected.
  if (v.status.via === null && first?.kind === 'ir') return line('irOnly');
  return line('connected');
}
