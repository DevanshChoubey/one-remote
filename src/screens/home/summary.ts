import { t } from '@/i18n';
import type { AcMode } from '@/core';
import type { DeviceView } from '@/services';

const MODE_KEY: Record<AcMode, string> = {
  cool: 'home.modeCool',
  dry: 'home.modeDry',
  fan: 'home.modeFan',
  auto: 'home.modeAuto',
};

/** The one-line state under a device's name; empty when nothing is known yet. */
export function cardSummary(view: DeviceView): string {
  const s = view.state;
  if (!s) return '';
  if (s.kind === 'ac') {
    if (!s.state.power) return t('home.summaryOff');
    return t('home.summaryAc', { mode: t(MODE_KEY[s.state.mode]), setpoint: s.state.setpoint });
  }
  if (s.kind === 'fan') {
    return s.state.power ? t('home.summaryFan', { speed: s.state.speed }) : t('home.summaryOff');
  }
  const tv = s.state;
  if (!tv.power) return t('home.summaryOff');
  if (tv.app !== undefined && tv.volume !== undefined) {
    return t('home.summaryTv', { app: tv.app, volume: tv.volume });
  }
  if (tv.app !== undefined) return tv.app;
  if (tv.volume !== undefined) return t('home.summaryVolume', { volume: tv.volume });
  return t('home.summaryOn');
}
