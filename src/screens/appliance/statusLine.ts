import { t } from '@/i18n';
import type { DeviceView } from '@/services';

/** The line at the bottom of an AC or fan screen: how the last press went out. */
export function statusLine(v: DeviceView): { key: string; params?: Record<string, string> } {
  const first = v.device.links[0];
  if (!v.usable) return { key: 'ac.status.needsIr' };
  if (v.status.via === 'ir') {
    if (v.status.fellBack && first) {
      return { key: 'ac.status.fellBack', params: { link: t(`device.link.${first.kind}`) } };
    }
    return { key: 'ac.status.irOnly' };
  }
  // Nothing sent yet: an IR-first device says so; any other link is taken as connected.
  if (v.status.via === null && first?.kind === 'ir') return { key: 'ac.status.irOnly' };
  return { key: 'ac.status.connected' };
}
