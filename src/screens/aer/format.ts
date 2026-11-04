// formatWhen is from aer-remote src/screens/home/format.ts (2026-11-04). Adapted: aer.* keys.
// ZONE_COUNTRY covers the 16 FALLBACK zones of aer-remote src/screens/settings/zones.ts.
import { t } from '@/i18n';
import { aerProblem, nextSprayToday, runsToday, zoneInfo } from '@/services';
import type { AerProblem, AerView, TimeOfDay, Weekday } from '@/services';

type TKey = string;

const MINUTE = 60_000;

/** A reading counts as fresh for this long; after it the card says when it was taken. */
export const AER_FRESH_MS = 3_600_000;

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function formatWhen(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < MINUTE) return t('aer.whenNow');
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 60) return t('aer.whenMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('aer.whenHours', { n: hours });
  return t('aer.whenDays', { n: Math.floor(hours / 24) });
}

/** '6:00 pm', '12:05 am'. */
export function formatTime(time: TimeOfDay): string {
  const { hm, ap } = formatTimeParts(time);
  return `${hm} ${ap}`;
}

export function formatTimeParts(time: TimeOfDay): { hm: string; ap: string } {
  const h12 = time.h % 12 === 0 ? 12 : time.h % 12;
  return { hm: `${h12}:${String(time.m).padStart(2, '0')}`, ap: time.h < 12 ? 'am' : 'pm' };
}

const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHORT_DAY: Record<Weekday, TKey> = {
  mon: 'aer.mon',
  tue: 'aer.tue',
  wed: 'aer.wed',
  thu: 'aer.thu',
  fri: 'aer.fri',
  sat: 'aer.sat',
  sun: 'aer.sun',
};

/** 'Every day', 'Weekdays', 'Weekends', else the short names in week order: 'Mon, Wed'. */
export function daysLabel(days: Weekday[]): string {
  const on = WEEK.filter((d) => days.includes(d));
  const is = (want: Weekday[]): boolean =>
    on.length === want.length && want.every((d) => on.includes(d));
  if (is(WEEK)) return t('aer.everyDay');
  if (is(['mon', 'tue', 'wed', 'thu', 'fri'])) return t('aer.weekdays');
  if (is(['sat', 'sun'])) return t('aer.weekends');
  return on.map((d) => t(SHORT_DAY[d])).join(', ');
}

const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'India',
  'Asia/Dubai': 'UAE',
  'Asia/Singapore': 'Singapore',
  'Asia/Tokyo': 'Japan',
  'Australia/Sydney': 'Australia',
  'Pacific/Auckland': 'New Zealand',
  'Europe/London': 'United Kingdom',
  'Europe/Paris': 'France',
  'Europe/Berlin': 'Germany',
  'Africa/Johannesburg': 'South Africa',
  'America/Sao_Paulo': 'Brazil',
  'America/New_York': 'United States',
  'America/Chicago': 'United States',
  'America/Denver': 'United States',
  'America/Los_Angeles': 'United States',
};

/** 'India · Kolkata'; a zone not in the map reads '<Area> · <City>'; 'UTC' stays 'UTC'. */
export function zoneLabel(zone: string): string {
  if (zone === 'UTC') return 'UTC';
  const slash = zone.indexOf('/');
  if (slash < 0) return zone.replaceAll('_', ' ');
  const area = zone.slice(0, slash);
  const city = zone.slice(zone.lastIndexOf('/') + 1).replaceAll('_', ' ');
  return `${ZONE_COUNTRY[zone] ?? area.replaceAll('_', ' ')} · ${city}`;
}

/** The zone's standard offset: 'UTC+5:30', 'UTC+0', 'UTC-5'. */
export function offsetLabel(zone: string, at: Date): string {
  const min = zoneInfo(zone, at).standardOffsetMin;
  const sign = min < 0 ? '-' : '+';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`}`;
}

/** The home card's first line: the next spray today, else why there is none. */
export function formatNextSpray(view: AerView, timeZone: string, now: Date): string {
  const list = view.schedules?.list ?? [];
  const next = nextSprayToday(list, now, timeZone);
  if (next) return t('aer.nextSpray', { time: formatTime(next) });
  const auto = view.status?.autoSpray;
  if (auto) return t('aer.autoCard', { minutes: auto });
  if (runsToday(list, now, timeZone)) return t('aer.doneToday');
  return t('aer.noScheduleToday');
}

/** The one line (banner or error line, a full sentence) and bar (short subtitle) for each problem; every screen words a failure through this map. */
export const PROBLEM_COPY: Record<AerProblem, { line: TKey; bar: TKey }> = {
  btoff: { line: 'aer.probBtOff', bar: 'aer.subBtOff' },
  denied: { line: 'aer.probDenied', bar: 'aer.subDenied' },
  away: { line: 'aer.probAway', bar: 'aer.subAway' },
  busy: { line: 'aer.probBusy', bar: 'aer.subBusy' },
  flat: { line: 'aer.probFlat', bar: 'aer.subFlat' },
  notAer: { line: 'aer.probNotAer', bar: 'aer.subNotAer' },
  scheduleRunning: { line: 'aer.probScheduleRunning', bar: 'aer.subScheduleRunning' },
  timeZone: { line: 'aer.probTimeZone', bar: 'aer.subTimeZone' },
  failed: { line: 'aer.probFailed', bar: 'aer.subFailed' },
};

export function problemCopy(e: unknown): { line: string; bar: string } {
  const c = PROBLEM_COPY[aerProblem(e)];
  return { line: t(c.line), bar: t(c.bar) };
}
