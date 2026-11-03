import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, EmptyState, Screen } from '@/ui';

export interface NoIrStepProps {
  canScanMatter: boolean;
  /** False when the catalogue has no remote to guess. */
  canAddAnyway: boolean;
  onScanMatter: () => void;
  onAddAnyway: () => void;
  onBack?: () => void;
}

export function NoIrStep(props: NoIrStepProps): ReactElement {
  return (
    <Screen
      onBack={props.onBack}
      footer={
        <Column gap={2}>
          {props.canScanMatter ? (
            <Button label={t('addAppliance.scanMatter')} onPress={props.onScanMatter} />
          ) : null}
          {props.canAddAnyway ? (
            <Button
              label={t('addAppliance.addAnyway')}
              variant="secondary"
              onPress={props.onAddAnyway}
            />
          ) : null}
        </Column>
      }
    >
      <EmptyState art="ir" title={t('addAppliance.noIrTitle')} body={t('addAppliance.noIrBody')} />
    </Screen>
  );
}
