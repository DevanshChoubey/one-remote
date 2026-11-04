import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, OptionCard, Screen } from '@/ui';

export function TvBrandStep(props: { onFind: () => void; onManual: () => void }): ReactElement {
  const router = useRouter();
  const { tvBrands } = useServices();
  // The first brand is picked to begin with, as in the mock; Continue ('Find my TV') goes on.
  const [picked, setPicked] = useState<string | undefined>(tvBrands[0]?.kind);
  return (
    <Screen
      title={t('addTv.title')}
      largeTitle
      onBack={() => router.back()}
      scroll
      footer={
        <Column gap={4}>
          <Button label={t('addTv.findMine')} onPress={props.onFind} />
          <Button label={t('addTv.typeAddress')} variant="ghost" onPress={props.onManual} />
        </Column>
      }
    >
      <Column gap={3}>
        {tvBrands.map((b, i) => (
          <OptionCard
            key={b.kind}
            index={i}
            icon="tv"
            size="regular"
            title={t(b.labelKey)}
            selected={picked === b.kind}
            onPress={() => setPicked(b.kind)}
          />
        ))}
      </Column>
    </Screen>
  );
}
