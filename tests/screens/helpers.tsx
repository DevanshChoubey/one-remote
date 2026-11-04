import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';
import type { Device, LinkDriver, Room } from '@/core';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { ThemeProvider } from '@/theme';
import { ToastProvider } from '@/ui';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemorySecretStore } from '@/store/secrets';
import { createMemoryPreferenceStore } from '@/store/preferences';

export function makeServices(drivers: LinkDriver[] = [], extra: Partial<Services> = {}): Services {
  const store = createMemoryStore();
  return createServices({
    store,
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
    aer: createFakeAerService({ home: store }),
    aerAlerts: createFakeAlerts(),
    ...extra,
  });
}

export async function renderWith(
  s: Services,
  ui: ReactElement,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): Promise<void> {
  await render(
    <ThemeProvider scheme={opts.scheme ?? 'light'} reducedMotion={opts.reducedMotion}>
      <ServicesProvider services={s}>
        <ToastProvider>{ui}</ToastProvider>
      </ServicesProvider>
    </ThemeProvider>,
  );
}

export const room = (id: string, name: string, order: number): Room => ({ id, name, order });

export const device = (
  id: string,
  roomId: string,
  order: number,
  over: Partial<Device> = {},
): Device => ({
  id,
  kind: 'ac',
  name: `Name ${id}`,
  roomId,
  order,
  links: [{ kind: 'ir', remoteId: 'x/y' }],
  ...over,
});

/** A Touchable draws its fill and border on its first child (`<testID>-surface`): flatten both. */
export function surfaceStyle(el: TestInstance): ViewStyle {
  const surface = el.children.find((c): c is TestInstance => typeof c !== 'string');
  return { ...StyleSheet.flatten(el.props.style), ...StyleSheet.flatten(surface?.props.style) };
}
