import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { LinkDriver } from '@/core';
import type { IrSetup } from '@/core/irSetup';
import type { DeviceHub } from '@/device/hub';
import type { PreferenceStore } from '@/store/preferences';
import type { HomeStore, SecretStore } from '@/store/types';

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
  ir: IrSetup;
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
