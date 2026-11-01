import type { ReactElement } from 'react';
import { isTvLink } from '@/core';
import type { Device, Link } from '@/core';
import { TvLinkActions } from '../tv/TvLinkActions';

export interface LinkActionProps {
  device: Device;
  link: Link;
}

/** Renders one lane's actions for a link, or null when the link is not that lane's. */
export type LinkActionRenderer = (props: LinkActionProps) => ReactElement | null;

/**
 * The seam for the lanes. Each lane adds its renderer on its own line, just under its own slot
 * comment (TV: `TvLinkActions`, Matter: `MatterLinkActions`); each shows under its own links in the
 * device sheet. Separate slots keep lane merges free of conflicts.
 */
export const LINK_ACTIONS: readonly LinkActionRenderer[] = [
  // tv lane
  ({ device, link }: LinkActionProps): ReactElement | null =>
    device.kind === 'tv' && isTvLink(link) ? (
      <TvLinkActions deviceId={device.id} link={link} />
    ) : null,
  // matter lane
  // ir lane
];

export interface DeviceActionProps {
  device: Device;
}

/** Renders one lane's device-level actions, or null when the device is not that lane's. */
export type DeviceActionRenderer = (props: DeviceActionProps) => ReactElement | null;

/**
 * The seam for actions on the device as a whole, rendered once per device, for example
 * "Add IR backup". Each lane adds its renderer on its own line, just under its own slot comment.
 */
export const DEVICE_ACTIONS: readonly DeviceActionRenderer[] = [
  // ir lane
  // tv lane
  // matter lane
];
