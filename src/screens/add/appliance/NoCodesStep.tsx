import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Screen, Txt } from '@/ui';

export interface NoCodesStepProps {
  kind: 'ac' | 'fan';
  /** True after a Matter pairing: carries on to naming. Otherwise back to Home. */
  carriesOn: boolean;
  onContinue: () => void;
  onBack?: () => void;
}

export function NoCodesStep(props: NoCodesStepProps): ReactElement {
  return (
    <Screen title={t('addAppliance.noCodesTitle')} onBack={props.onBack}>
      <Column gap={4}>
        <Txt>{t(props.kind === 'ac' ? 'addAppliance.noCodesAc' : 'addAppliance.noCodesFan')}</Txt>
        <Button
          label={t(props.carriesOn ? 'addAppliance.continue' : 'addAppliance.home')}
          onPress={props.onContinue}
        />
      </Column>
    </Screen>
  );
}
