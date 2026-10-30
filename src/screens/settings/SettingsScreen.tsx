import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { useServices } from '@/services';
import type { Preferences } from '@/services';
import { Box, Chip, Column, Row, Screen, Toggle, Touchable, Txt } from '@/ui';
import { useHomeData } from '../shared/useHomeData';
import { RoomsEditor } from './RoomsEditor';

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

/** A row that opens its own detail underneath. */
function Section(props: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <Column gap={2}>
      <Touchable
        onPress={props.onToggle}
        accessibilityLabel={props.title}
        accessibilityRole="button"
      >
        <Row justify="between" align="center">
          <Txt variant="bodyBold">{props.title}</Txt>
          <Txt color="ink2">
            {props.hint ? `${props.hint} ${props.open ? '⌃' : '›'}` : props.open ? '⌃' : '›'}
          </Txt>
        </Row>
      </Touchable>
      {props.open ? <Box>{props.children}</Box> : null}
    </Column>
  );
}

export function SettingsScreen(): ReactElement {
  const { prefs } = useServices();
  const router = useRouter();
  const current = usePreferences();
  const data = useHomeData();
  const [open, setOpen] = useState<'rooms' | 'privacy' | 'about' | null>(null);
  const toggle = (which: 'rooms' | 'privacy' | 'about'): void =>
    setOpen((o) => (o === which ? null : which));
  const save = (p: Partial<Preferences>): void => {
    prefs.set(p).catch((e: unknown) => console.error('Could not save preferences', e));
  };

  return (
    <Screen title={t('settings.title')} onBack={() => router.back()} scroll>
      <Column gap={5}>
        <Column gap={2}>
          <Txt variant="bodyBold">{t('settings.theme')}</Txt>
          <Row gap={2} wrap>
            {THEMES.map((th) => (
              <Chip
                key={th.value}
                label={t(th.key)}
                state={current?.theme === th.value ? 'selected' : 'neutral'}
                onToggle={() => save({ theme: th.value })}
              />
            ))}
          </Row>
        </Column>

        {Platform.OS === 'ios' ? null : (
          <Toggle
            label={t('settings.volumeKeys')}
            value={current?.volumeKeys ?? true}
            onChange={(v) => save({ volumeKeys: v })}
          />
        )}
        <Toggle
          label={t('settings.haptics')}
          value={current?.haptics ?? true}
          onChange={(v) => save({ haptics: v })}
        />

        <Section
          title={t('settings.rooms')}
          hint={t('settings.roomsHint')}
          open={open === 'rooms'}
          onToggle={() => toggle('rooms')}
        >
          <RoomsEditor rooms={data.rooms} />
        </Section>

        <Section
          title={t('settings.privacy')}
          hint={t('settings.privacyHint')}
          open={open === 'privacy'}
          onToggle={() => toggle('privacy')}
        >
          <Txt color="ink2">{t('settings.privacyBody')}</Txt>
        </Section>

        <Section
          title={t('settings.about')}
          open={open === 'about'}
          onToggle={() => toggle('about')}
        >
          <Column gap={3}>
            <Txt color="ink2">{t('settings.licenseApp')}</Txt>
            <Txt color="ink2">{t('settings.licenseOss')}</Txt>
            <Txt color="ink2">{t('settings.licenseLgpl')}</Txt>
          </Column>
        </Section>
      </Column>
    </Screen>
  );
}
