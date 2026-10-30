import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createServices, ServicesProvider } from '@/services';
import type { Preferences, Services } from '@/services';
import { ThemeProvider } from '@/theme';

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
  return <ThemeProvider preference={theme}>{props.children}</ThemeProvider>;
}

export function AppProviders(props: AppProvidersProps): ReactElement {
  const [services] = useState(() => props.services ?? createServices());
  return (
    <ServicesProvider services={services}>
      <ThemeFromPrefs services={services}>{props.children}</ThemeFromPrefs>
    </ServicesProvider>
  );
}
