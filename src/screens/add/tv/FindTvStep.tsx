import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Linking, Platform } from 'react-native';
import type { FoundTv } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import {
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
import { TextLink } from '@/ui/add';
import { Radar } from '@/ui/addtv';

/** How long a search with no answer runs before the screen says so. */
export const SEARCH_MS = 8000;

export interface FindTvStepProps {
  onPick: (tv: FoundTv) => void;
  onManual: () => void;
  onBack: () => void;
}

/** Lists TVs as discovery finds them; discovery stops when the step is left. */
export function FindTvStep(props: FindTvStepProps): ReactElement {
  const { tv } = useServices();
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
    <Screen
      title={t('addTv.findTitle')}
      subtitle={t('addTv.findSub')}
      largeTitle
      onBack={props.onBack}
      scroll
      footer={
        // Pinned at the bottom (the mock's `.grow` before them): the status line and the way out.
        <Column gap={4}>
          {ended || !none ? (
            <Row gap={2} align="center" justify="center">
              {ended ? null : <Spinner size="xs" color="ink2" />}
              <Txt variant="caption" color="ink2" live>
                {t('addTv.stillLooking')}
              </Txt>
            </Row>
          ) : null}
          <TextLink label={t('addTv.cantFind')} onPress={props.onManual} />
        </Column>
      }
    >
      {ended && Platform.OS === 'ios' ? (
        <>
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
        </>
      ) : null}
      {/* The mock's radar has 8 px more air above and below it. */}
      <Box align="center" py={2}>
        <Radar searching={!ended} />
      </Box>
      {none ? (
        <Txt color="ink2" align="center" live={ended}>
          {ended ? t('addTv.sameWifi') : t('addTv.findBody')}
        </Txt>
      ) : (
        <Column gap={2}>
          {found.map((f) => (
            // Each row rises as its TV answers, so no stagger on top.
            <Rise key={f.host}>
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
                  <Icon name="chev" size={22} color="ink2" />
                </Card>
              </Touchable>
            </Rise>
          ))}
        </Column>
      )}
    </Screen>
  );
}
