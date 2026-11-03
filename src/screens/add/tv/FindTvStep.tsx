import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Linking, Platform } from 'react-native';
import type { FoundTv } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { Services } from '@/services';
import {
  Badge,
  Banner,
  Box,
  Button,
  Card,
  Column,
  Icon,
  Rise,
  Row,
  Screen,
  Spinner,
  Tile,
  Touchable,
  Txt,
} from '@/ui';
import { Radar } from '@/ui/addtv';

/** How long a search with no answer runs before the screen says so. */
export const SEARCH_MS = 8000;

export interface FindTvStepProps {
  onPick: (tv: FoundTv) => void;
  onManual: () => void;
  onBack: () => void;
}

function brandWord(brands: Services['tvBrands'], kind: FoundTv['kind']): string {
  const b = brands.find((x) => x.kind === kind);
  return b ? t(b.labelKey) : kind;
}

/** Lists TVs as discovery finds them; discovery stops when the step is left. */
export function FindTvStep(props: FindTvStepProps): ReactElement {
  const { tv, tvBrands } = useServices();
  const [found, setFound] = useState<FoundTv[]>([]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const stop = tv.discover((hit) =>
      setFound((all) => [...all.filter((f) => f.host !== hit.host), hit]),
    );
    return stop;
  }, [tv]);
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), SEARCH_MS);
    return () => clearTimeout(id);
  }, []);

  const none = found.length === 0;
  // A search that ended with nothing: the radar rests and the screen names the likely cause.
  const ended = waited && none;

  return (
    <Screen title={t('addTv.findTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt color="ink2">{t('addTv.findSub')}</Txt>
        {ended && Platform.OS === 'ios' ? (
          <Column gap={3}>
            <Banner tone="error" icon="lock" text={t('addTv.localNetworkOff')} />
            <Button
              label={t('common.openSettings')}
              variant="secondary"
              onPress={() => {
                Linking.openSettings().catch((e: unknown) =>
                  console.error('Could not open Settings', e),
                );
              }}
            />
          </Column>
        ) : null}
        <Box align="center">
          <Radar searching={!ended} />
        </Box>
        {none ? (
          <Txt color="ink2" live={ended}>
            {ended ? t('addTv.sameWifi') : t('addTv.findBody')}
          </Txt>
        ) : null}
        <Column gap={3}>
          {found.map((f, i) => (
            <Rise key={f.host} index={i}>
              <Touchable
                onPress={() => props.onPick(f)}
                accessibilityLabel={`${f.name}, ${f.host}`}
                pressScale={0.985}
                radius="md"
              >
                <Card row>
                  <Tile icon="tv" />
                  <Box flex={1}>
                    <Column gap={1}>
                      <Txt variant="bodyBold">{f.name}</Txt>
                      <Txt variant="caption" color="ink2">
                        {f.host}
                      </Txt>
                    </Column>
                  </Box>
                  <Badge label={brandWord(tvBrands, f.kind)} />
                  <Icon name="chev" size={20} color="ink2" />
                </Card>
              </Touchable>
            </Rise>
          ))}
        </Column>
        {ended || !none ? (
          <Row gap={2} align="center" justify="center">
            {ended ? null : <Spinner size="sm" />}
            <Txt variant="caption" color="ink2" live>
              {t('addTv.stillLooking')}
            </Txt>
          </Row>
        ) : null}
        <Button label={t('addTv.cantFind')} variant="ghost" onPress={props.onManual} />
      </Column>
    </Screen>
  );
}
