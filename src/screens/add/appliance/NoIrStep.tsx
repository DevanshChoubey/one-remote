import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Screen, Txt } from '@/ui';

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
    <Screen title={t('addAppliance.noIrTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt color="ink2">{t('addAppliance.noIrBody')}</Txt>
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
    </Screen>
  );
}
