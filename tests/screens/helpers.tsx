import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { Device, LinkDriver, Room } from '@/core';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { ThemeProvider } from '@/theme';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemorySecretStore } from '@/store/secrets';
import { createMemoryPreferenceStore } from '@/store/preferences';

export function makeServices(drivers: LinkDriver[] = []): Services {
  return createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers,
  });
}

export async function renderWith(s: Services, ui: ReactElement): Promise<void> {
  await render(
    <ThemeProvider scheme="light">
      <ServicesProvider services={s}>{ui}</ServicesProvider>
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
