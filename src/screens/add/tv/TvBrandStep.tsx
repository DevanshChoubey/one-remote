import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, OptionCard, Screen } from '@/ui';

export function TvBrandStep(props: { onFind: () => void; onManual: () => void }): ReactElement {
  const router = useRouter();
  const { tvBrands } = useServices();
  return (
    <Screen
      title={t('addTv.title')}
      onBack={() => router.back()}
      scroll
      footer={
        <Column gap={2}>
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
            title={t(b.labelKey)}
            onPress={props.onFind}
          />
        ))}
      </Column>
    </Screen>
  );
}
