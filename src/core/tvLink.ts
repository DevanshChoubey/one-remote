import type { Device, Link } from './model';

export type TvLinkKind = 'webos' | 'androidtv' | 'samsung';
export type TvLink = Extract<Link, { kind: TvLinkKind }>;

export function isTvLink(l: Link): l is TvLink {
  return l.kind === 'webos' || l.kind === 'androidtv' || l.kind === 'samsung';
}

/** The device's network TV link (first one), or undefined. */
export function tvLinkOf(device: Device): TvLink | undefined {
  return device.links.find(isTvLink);
}

/** The reference of the link's secret: the webOS client key, the Android TV cert or the Samsung token. */
export function tvLinkRef(link: TvLink): string {
  switch (link.kind) {
    case 'webos':
      return link.clientKeyRef;
    case 'androidtv':
      return link.certRef;
    case 'samsung':
      return link.tokenRef;
  }
}

/** A copy of the device with that TV link's host replaced. Other links are untouched. */
export function withTvHost(device: Device, host: string): Device {
  const i = device.links.findIndex(isTvLink);
  if (i < 0) return device;
  const links = device.links.slice();
  links[i] = { ...(links[i] as TvLink), host };
  return { ...device, links };
}
