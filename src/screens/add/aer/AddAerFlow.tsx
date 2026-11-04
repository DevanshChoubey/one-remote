import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { EmptyState, Screen } from '@/ui';

/** Add an air freshener. First version: the Android 12 gate; the scan steps come later. */
export function AddAerFlow(): ReactElement {
  const router = useRouter();
  const { aer } = useServices();
  if (!aer.supported()) {
    return (
      <Screen onBack={() => router.back()}>
        <EmptyState art="aer" fill title={t('add.kindAer')} body={t('add.needsAndroid12')} />
      </Screen>
    );
  }
  return <Screen onBack={() => router.back()}>{null}</Screen>;
}
