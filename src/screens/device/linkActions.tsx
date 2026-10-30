import type { ReactElement } from 'react';
import type { Device, Link } from '@/core';

export interface LinkActionProps {
  device: Device;
  link: Link;
}

/** Renders one lane's actions for a link, or null when the link is not that lane's. */
export type LinkActionRenderer = (props: LinkActionProps) => ReactElement | null;

/**
 * The seam for the lanes. Each lane adds one line here, for example `TvLinkActions`,
 * `IrBackupAction` or `MatterLinkActions`; each shows under its own links in the device sheet.
 */
export const LINK_ACTIONS: readonly LinkActionRenderer[] = [];
