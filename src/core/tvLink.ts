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

/** A copy of the device with that TV link's host replaced. Other links are untouched. */
export function withTvHost(device: Device, host: string): Device {
  const i = device.links.findIndex(isTvLink);
  if (i < 0) return device;
  const links = device.links.slice();
  links[i] = { ...(links[i] as TvLink), host };
  return { ...device, links };
}
