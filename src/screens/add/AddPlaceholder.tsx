import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Screen, Txt } from '@/ui';

/** Stands in for a kind's add flow until its lane plan lands. */
export function AddPlaceholder(props: { kind: 'tv' | 'ac' | 'fan' }): ReactElement {
  const router = useRouter();
  const label = t(`add.kind${props.kind === 'tv' ? 'Tv' : props.kind === 'ac' ? 'Ac' : 'Fan'}`);
  return (
    <Screen title={label} onBack={() => router.back()}>
      <Txt color="ink2">{t('add.placeholderBody', { kind: label })}</Txt>
    </Screen>
  );
}
