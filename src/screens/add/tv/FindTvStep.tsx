import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Box, Column, Screen, Touchable, Txt } from '@/ui';

export interface FindTvStepProps {
  onPick: (tv: FoundTv) => void;
  onManual: () => void;
  onBack: () => void;
}

/** Lists TVs as discovery finds them; discovery stops when the step is left. */
export function FindTvStep(props: FindTvStepProps): ReactElement {
  const { tv } = useServices();
  const [found, setFound] = useState<FoundTv[]>([]);
  useEffect(() => {
    const stop = tv.discover((hit) =>
      setFound((all) => [...all.filter((f) => f.host !== hit.host), hit]),
    );
    return stop;
  }, [tv]);

  return (
    <Screen title={t('addTv.findTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt color="ink2">{t('addTv.findSub')}</Txt>
        <Txt>{t('addTv.findBody')}</Txt>
        {found.map((f) => (
          <Touchable
            key={f.host}
            onPress={() => props.onPick(f)}
            accessibilityLabel={`${f.name}, ${f.host}`}
          >
            <Box bg="surface" border="line" radius="md" p={4}>
              <Column gap={1}>
                <Txt variant="bodyBold">{f.name}</Txt>
                <Txt variant="caption" color="ink2">
                  {f.host}
                </Txt>
              </Column>
            </Box>
          </Touchable>
        ))}
        <Txt color="ink2" live>
          {t('addTv.stillLooking')}
        </Txt>
        <Touchable onPress={props.onManual} accessibilityLabel={t('addTv.cantFind')}>
          <Txt color="accent">{t('addTv.cantFind')}</Txt>
        </Touchable>
      </Column>
    </Screen>
  );
}
