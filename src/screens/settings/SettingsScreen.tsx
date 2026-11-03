import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { Preferences } from '@/services';
import { Banner, Box, Column, Group, ListItem, Screen, SegmentedControl, Toggle, Txt } from '@/ui';
import { useHomeData } from '../shared/useHomeData';
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
      <Column gap={5}>
        <Column gap={2}>
          <Txt variant="label" color="ink2">
            {t('settings.theme')}
          </Txt>
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

        <Group>
          {row('rooms', t('settings.rooms'), t('settings.roomsHint'))}
          {open === 'rooms' ? (
            <Box p={4}>
              <RoomsEditor rooms={data.rooms} />
            </Box>
          ) : null}
          {row('privacy', t('settings.privacy'), t('settings.privacyHint'))}
          {open === 'privacy' ? (
            <Box p={4}>
              <Banner tone="ok" icon="lock" text={t('settings.privacyBody')} />
            </Box>
          ) : null}
          {row('about', t('settings.about'))}
          {open === 'about' ? (
            <Box p={4}>
              <Column gap={3}>
                <Txt color="ink2">{t('settings.licenseApp')}</Txt>
                <Txt color="ink2">{t('settings.licenseOss')}</Txt>
                <Txt color="ink2">{t('settings.licenseEncoders')}</Txt>
                <Txt color="ink2">{t('settings.licenseFanCodes')}</Txt>
                <Txt color="ink2">{t('settings.licenseSourceOffer')}</Txt>
              </Column>
            </Box>
          ) : null}
        </Group>
      </Column>
    </Screen>
  );
}
