import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Alerts } from '@/aer/alerts/types';
import type { AerService, DispenserStore } from '@/aer/types';
import type { LinkDriver, TvSetup } from '@/core';
import type { GreeSetup } from '@/core/greeSetup';
import type { IrSetup } from '@/core/irSetup';
import type { MatterSetup } from '@/core/matterSetup';
import type { BrandSetup } from '@/tv/brands';
import type { Dictation } from '@/voice/dictation';
import type { Mic } from '@/voice/mic';
import type { DeviceHub } from '@/device/hub';
import type { PreferenceStore } from '@/store/preferences';
import type { HomeStore, SecretStore } from '@/store/types';

export type TvBrandInfo = Pick<BrandSetup, 'kind' | 'labelKey' | 'pairing' | 'codeLength'>;

/**
 * Everything the screens can reach. Each lane adds one typed field here (`tv`, `ir`, `matter`) and
 * one entry in `createServices`.
 */
export interface Services {
  hub: DeviceHub;
  store: HomeStore;
  secrets: SecretStore;
  prefs: PreferenceStore;
  drivers: LinkDriver[];
  /** Removes a device and lets each link's driver forget it. Use this, not `store.removeDevice`. */
  removeDevice(id: string): Promise<void>;
  // Lanes add their typed field just under their own slot comment.
  // tv lane
  tv: TvSetup;
  /** The registered brands, for the brand list, the brand word and the pairing step. */
  tvBrands: readonly TvBrandInfo[];
  // voice
  voice: { mic: Mic; dictation: Dictation };
  // ir lane
  ir: IrSetup;
  // matter lane
  matter: MatterSetup;
  // gree lane
  gree: GreeSetup;
  // aer lane
  aer: AerService;
  aerAlerts: Alerts;
  /** The readings the alerts plan from. Only the dev spike writes here; screens use `aer`. */
  aerDispensers?: DispenserStore;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider(props: { services: Services; children: ReactNode }): ReactElement {
  return (
    <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices must be used inside <ServicesProvider>');
  return s;
}
