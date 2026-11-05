import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { Preferences } from '@/services';
import {
  Banner,
  Box,
  Column,
  Group,
  ListItem,
  Screen,
  SegmentedControl,
  Spacer,
  Toggle,
  Txt,
} from '@/ui';
import { useHomeData } from '../shared/useHomeData';
import { AlertsGroup } from './AlertsGroup';
import { RoomsEditor } from './RoomsEditor';

type Open = 'rooms' | 'privacy' | 'about';

const THEMES = [
  { value: 'system', key: 'settings.themeSystem' },
  { value: 'light', key: 'settings.themeLight' },
  { value: 'dark', key: 'settings.themeDark' },
] as const;

function usePreferences(): Preferences | null {
  const { prefs } = useServices();
  const [current, setCurrent] = useState<Preferences | null>(null);
  useEffect(() => {
    let alive = true;
    let issued = 0;
    let applied = 0;
    const load = (): void => {
      const mine = ++issued;
      prefs.get().then(
        (p) => {
          if (!alive || mine < applied) return;
          applied = mine;
          setCurrent(p);
        },
        (e: unknown) => console.error('Could not load preferences', e),
      );
    };
    load();
    const stop = prefs.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [prefs]);
  return current;
}

export function SettingsScreen(): ReactElement {
  const { prefs } = useServices();
  const router = useRouter();
  const current = usePreferences();
  const data = useHomeData();
  const [open, setOpen] = useState<Open | null>(null);
  const toggle = (which: Open): void => setOpen((o) => (o === which ? null : which));
  const save = (p: Partial<Preferences>): void => {
    prefs.set(p).catch((e: unknown) => console.error('Could not save preferences', e));
  };

  const row = (key: Open, title: string, subtitle?: string): ReactElement => (
    <ListItem
      title={title}
      subtitle={subtitle}
      trailing="expand"
      expanded={open === key}
      onPress={() => toggle(key)}
    />
  );
  // Mock `.acc-body`: 4 px under the row, 16 at the sides and bottom.
  const body = (children: ReactElement): ReactElement => (
    <Box px={4}>
      <Spacer size={1} />
      {children}
      <Spacer size={4} />
    </Box>
  );
  const volumeKeys =
    Platform.OS === 'ios' ? null : (
      <Box px={4} py={2} minH={56} justify="center">
        <Toggle
          label={t('settings.volumeKeys')}
          value={current?.volumeKeys ?? true}
          onChange={(v) => save({ volumeKeys: v })}
        />
      </Box>
    );

  return (
    <Screen title={t('settings.title')} onBack={() => router.back()} scroll>
      {/* Mock `.scroll` gap 12; the "Theme" `.sect` is 8 px lower, 4 px in, 4 px above the segment. */}
      <Box>
        <Spacer size={2} />
        <Column gap={3}>
          <Column gap={1}>
            <Box px={1}>
              <Txt variant="captionBold" color="ink2">
                {t('settings.theme')}
              </Txt>
            </Box>
            <SegmentedControl
              label={t('settings.theme')}
              options={THEMES.map((th) => ({ value: th.value, label: t(th.key) }))}
              value={current?.theme ?? 'system'}
              onChange={(v) => save({ theme: v })}
            />
          </Column>

          <Group>
            {volumeKeys}
            <Box px={4} py={2} minH={56} justify="center">
              <Toggle
                label={t('settings.haptics')}
                value={current?.haptics ?? true}
                onChange={(v) => save({ haptics: v })}
              />
            </Box>
          </Group>

          <AlertsGroup />

          <Group>
            {row('rooms', t('settings.rooms'), t('settings.roomsHint'))}
            {open === 'rooms' ? body(<RoomsEditor rooms={data.rooms} />) : null}
            {row('privacy', t('settings.privacy'), t('settings.privacyHint'))}
            {open === 'privacy'
              ? body(<Banner tone="ok" icon="lock" text={t('settings.privacyBody')} />)
              : null}
            {row('about', t('settings.about'))}
            {open === 'about'
              ? body(
                  <Column gap={3}>
                    <Txt color="ink2">{t('settings.licenseApp')}</Txt>
                    <Txt color="ink2">{t('settings.licenseOss')}</Txt>
                    <Txt color="ink2">{t('settings.licenseEncoders')}</Txt>
                    <Txt color="ink2">{t('settings.licenseFanCodes')}</Txt>
                    <Txt color="ink2">{t('settings.licenseSourceOffer')}</Txt>
                  </Column>,
                )
              : null}
          </Group>
        </Column>
      </Box>
    </Screen>
  );
}
