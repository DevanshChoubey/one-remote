import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useServices } from '@/services';

/** Opens the tapped alert's device, or goes home when that device is gone. */
export function useAerAlertOpen(): void {
  const { aerAlerts } = useServices();
  const router = useRouter();
  useEffect(
    () =>
      aerAlerts.onOpen((id) => {
        if (id === null) router.replace('/');
        else router.push(`/device/${id}`);
      }),
    [aerAlerts, router],
  );
}
