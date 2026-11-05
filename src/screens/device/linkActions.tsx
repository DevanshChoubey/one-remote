import type { ReactElement } from 'react';
import { isTvLink } from '@/core';
import type { Device, Link } from '@/core';
import type { Services } from '@/services';
import { TvLinkActions, TvPairAgainRow } from '../tv/TvLinkActions';
import { aerSheetAction } from '../aer/AerSheetActions';
import { IrRedoRow, irBackupAction } from '../appliance/IrBackupAction';

/** A row in the link group asked the link's own block to do something ("pairAgain"). */
export interface LinkRequest {
  key: string;
  /** Bumped on every press, so the same request twice runs twice. */
  n: number;
}

export interface LinkActionProps {
  device: Device;
  link: Link;
  /** The sheet was opened to pair the TV again (it lost trust in the phone). */
  repair?: boolean;
  /** The last request from a row in the "How it's connected" group. */
  request?: LinkRequest | null;
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
  ({ device, link, repair, request }: LinkActionProps): ReactElement | null =>
    device.kind === 'tv' && isTvLink(link) ? (
      <TvLinkActions deviceId={device.id} link={link} repair={repair} request={request} />
    ) : null,
  // matter lane
  // ir lane
];

export interface LinkRowProps {
  device: Device;
  link: Link;
  repair: boolean;
  services: Services;
  /** Hands a request to the link's own block (`LinkActionProps.request`). */
  onRequest: (key: string) => void;
}

/**
 * Renders one lane's chevron row inside the "How it's connected" group, right under its link, or
 * null. It decides synchronously, so the group never draws an empty row and its divider.
 */
export type LinkRowRenderer = (props: LinkRowProps) => ReactElement | null;

/** Mock `sheetSettings`: "Pair again" (trust lost) and "Redo IR backup" rows in the group. */
export const LINK_ROWS: readonly LinkRowRenderer[] = [
  // tv lane
  ({ device, link, repair, onRequest }: LinkRowProps): ReactElement | null =>
    repair && device.kind === 'tv' && isTvLink(link) ? (
      <TvPairAgainRow onPress={() => onRequest('pairAgain')} />
    ) : null,
  // ir lane
  ({ device, link, services }: LinkRowProps): ReactElement | null =>
    link.kind === 'ir' && device.kind !== 'tv' && services.ir.hasEmitter() ? (
      <IrRedoRow deviceId={device.id} />
    ) : null,
];

export interface DeviceActionProps {
  device: Device;
  /** A non-null node replaces the sheet's body (as the remove confirm does); null gives it back. */
  takeOver(node: ReactElement | null): void;
}

/** Renders one lane's device-level actions, or null when the device is not that lane's. */
export type DeviceActionRenderer = (props: DeviceActionProps) => ReactElement | null;

/**
 * The seam for actions on the device as a whole, rendered once per device, for example
 * "Add IR backup". Each lane adds its renderer on its own line, just under its own slot comment.
 */
export const DEVICE_ACTIONS: readonly DeviceActionRenderer[] = [
  // ir lane
  irBackupAction,
  // tv lane
  // matter lane
  // aer lane
  aerSheetAction,
];
