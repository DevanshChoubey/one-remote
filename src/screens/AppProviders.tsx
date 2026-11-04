import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AppState } from 'react-native';
import { createServices, ServicesProvider } from '@/services';
import type { Preferences, Services } from '@/services';
import { ThemeProvider } from '@/theme';
import { ToastProvider } from '@/ui';

export interface AppProvidersProps {
  children: ReactNode;
  /** Replaces the real services (tests). */
  services?: Services;
}

function ThemeFromPrefs(props: { services: Services; children: ReactNode }): ReactElement {
  const { prefs } = props.services;
  const [theme, setTheme] = useState<Preferences['theme']>('system');
  useEffect(() => {
    let alive = true;
    let issued = 0;
    let applied = 0;
    const load = (): void => {
      const mine = ++issued;
      prefs.get().then(
        (p) => {
          if (!alive || mine < applied) return;
          applied = mine;
          setTheme(p.theme);
        },
        (e: unknown) => console.error('Could not load preferences', e),
      );
    };
    load();
    const stop = prefs.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [prefs]);
  return (
    <ThemeProvider preference={theme}>
      <ToastProvider>{props.children}</ToastProvider>
    </ThemeProvider>
  );
}

/** Starts the alerts and frees the dispenser's Bluetooth link when the app goes to the background. */
function AerGlue(props: { services: Services }): null {
  const { aer, aerAlerts } = props.services;
  useEffect(() => aerAlerts.start(), [aerAlerts]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') aer.closeAll().catch(() => undefined);
    });
    return () => sub.remove();
  }, [aer]);
  return null;
}

export function AppProviders(props: AppProvidersProps): ReactElement {
  const [services] = useState(() => props.services ?? createServices());
  return (
    <ServicesProvider services={services}>
      <ThemeFromPrefs services={services}>
        <AerGlue services={services} />
        {props.children}
      </ThemeFromPrefs>
    </ServicesProvider>
  );
}
