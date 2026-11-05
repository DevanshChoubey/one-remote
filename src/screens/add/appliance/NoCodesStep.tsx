import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, EmptyState, Screen } from '@/ui';

export interface NoCodesStepProps {
  kind: 'ac' | 'fan';
  /** True after a Matter pairing: carries on to naming. Otherwise back to Home. */
  carriesOn: boolean;
  onContinue: () => void;
  onBack?: () => void;
}

export function NoCodesStep(props: NoCodesStepProps): ReactElement {
  return (
    <Screen
      onBack={props.onBack}
      footer={
        <Button
          label={t(props.carriesOn ? 'addAppliance.continue' : 'addAppliance.home')}
          onPress={props.onContinue}
        />
      }
    >
      <EmptyState
        art="alert"
        fill
        title={t('addAppliance.noCodesTitle')}
        body={t(props.kind === 'ac' ? 'addAppliance.noCodesAc' : 'addAppliance.noCodesFan')}
      />
    </Screen>
  );
}
