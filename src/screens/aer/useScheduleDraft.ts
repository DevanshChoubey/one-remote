// Ported from aer-remote src/screens/schedule/useScheduleDraft.ts (2026-11-04), without the
// steppers. Adapted: the dispenser list comes from the AerService view (not a store and client),
// and failures are worded through PROBLEM_COPY.
import { useEffect, useRef, useState } from 'react';
import {
  aerProblem,
  MAX_SCHEDULES,
  repeatCount,
  sprayCount,
  useServices,
  validateSchedule,
} from '@/services';
import type { AerInterval, AerSchedule, ScheduleProblem, TimeOfDay, Weekday } from '@/services';
import { PROBLEM_COPY } from './format';
import { useAerView } from './useAerView';

export type DraftProblem = ScheduleProblem | 'tooMany';
export type SaveOutcome = 'done' | 'rounded' | 'failed';

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const NEW_SCHEDULE: AerSchedule = {
  start: { h: 8, m: 0 },
  end: { h: 20, m: 0 },
  days: [...WEEKDAYS],
  interval: 20,
};

const sortDays = (days: readonly Weekday[]): Weekday[] => WEEKDAYS.filter((d) => days.includes(d));

const sameTime = (a: TimeOfDay, b: TimeOfDay): boolean => a.h === b.h && a.m === b.m;

const sameSchedule = (a: AerSchedule, b: AerSchedule): boolean =>
  sameTime(a.start, b.start) &&
  sameTime(a.end, b.end) &&
  a.interval === b.interval &&
  sortDays(a.days).join() === sortDays(b.days).join();

/** Same length and every expected entry present once each, in any order. */
function sameList(expected: AerSchedule[], actual: AerSchedule[]): boolean {
  if (expected.length !== actual.length) return false;
  const left = [...actual];
  for (const want of expected) {
    const at = left.findIndex((s) => sameSchedule(s, want));
    if (at < 0) return false;
    left.splice(at, 1);
  }
  return true;
}

export interface ScheduleDraft {
  /** Editing an index that is not on the dispenser's list. */
  stale: boolean;
  /** True while the dispenser's list has never been read, so saving could erase unknowns. */
  unknown: boolean;
  /** The refresh that reads the list is running. */
  refreshing: boolean;
  isNew: boolean;
  draft: AerSchedule;
  problems: DraftProblem[];
  sprays: number;
  canSave: boolean;
  saving: boolean;
  /** An aer.* copy key for the last failure. */
  errorKey: string | null;
  /** The end time the dispenser kept after the last save (null if it kept what was asked). */
  lastRoundedEnd(): TimeOfDay | null;
  setStart(time: TimeOfDay): void;
  setEnd(time: TimeOfDay): void;
  toggleDay(day: Weekday): void;
  setInterval(interval: AerInterval): void;
  save(): Promise<SaveOutcome>;
  remove(): Promise<boolean>;
  refresh(): Promise<void>;
}

/** The draft of one schedule (new when `index` is undefined) for dispenser `deviceId`. */
export function useScheduleDraft(deviceId: string, index: number | undefined): ScheduleDraft {
  const { aer } = useServices();
  const view = useAerView(deviceId);
  const list = view.schedules?.list;
  /** The entry being edited, by value, captured once the list is first known. null = adding. */
  const [original, setOriginal] = useState<AerSchedule | null | undefined>(undefined);
  const [edited, setEdited] = useState<AerSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  const inflight = useRef(false);
  const rounded = useRef<TimeOfDay | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Capture once (state adjusted during render, not in an effect).
  if (original === undefined && list) {
    setOriginal(index === undefined ? null : (list[index] ?? null));
  }

  const editing = original !== undefined && original !== null;
  const isNew = !editing && index === undefined;
  const draft: AerSchedule =
    edited ?? (original ? { ...original, days: sortDays(original.days) } : NEW_SCHEDULE);

  const problems: DraftProblem[] = validateSchedule(draft);
  if (isNew && list && list.length >= MAX_SCHEDULES) problems.push('tooMany');
  const unknown = list === undefined;
  const stale = index !== undefined && original === null;
  const ready = !unknown && !stale;

  const edit = (change: Partial<AerSchedule>): void => {
    rounded.current = null;
    setEdited({ ...draft, ...change });
  };

  const failWith = (key: string): void => {
    if (alive.current) setErrorKey(key);
  };

  /**
   * Writes the whole list. The dispenser's list is the source of truth: it is read fresh and the
   * entry being edited is found in it by value. If it is gone nothing is written.
   */
  const write = async (
    build: (current: AerSchedule[], at: number) => AerSchedule[],
  ): Promise<{ sent: AerSchedule[]; readBack: AerSchedule[] } | null> => {
    setSaving(true);
    setErrorKey(null);
    try {
      const fresh = aer.view(deviceId).schedules?.list ?? list ?? [];
      const at = original ? fresh.findIndex((s) => sameSchedule(s, original)) : -1;
      if (original && at < 0) {
        failWith(PROBLEM_COPY.failed.line);
        return null;
      }
      const sent = build(fresh, at);
      return { sent, readBack: await aer.saveSchedules(deviceId, sent) };
    } catch (e) {
      failWith(PROBLEM_COPY[aerProblem(e)].line);
      return null;
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const save = async (): Promise<SaveOutcome> => {
    if (!ready || problems.length > 0 || inflight.current) return 'failed';
    inflight.current = true;
    rounded.current = null;
    try {
      const entry: AerSchedule = { ...draft, days: sortDays(draft.days) };
      // The dispenser stores a repeat count, not an end, so it reads back start + count x interval.
      const repeats = repeatCount(entry);
      const minutes = entry.start.h * 60 + entry.start.m + repeats * entry.interval;
      const normalized: AerSchedule = {
        ...entry,
        end: { h: Math.floor(minutes / 60), m: minutes % 60 },
      };
      let pos = -1;
      const written = await write((current, at) => {
        pos = at < 0 ? current.length : at;
        return at < 0 ? [...current, entry] : current.map((s, i) => (i === at ? entry : s));
      });
      if (!written) return 'failed';
      // The whole list must read back as sent (the edited end normalized), in any order.
      const expected = written.sent.map((s, i) => (i === pos ? normalized : s));
      if (!sameList(expected, written.readBack)) {
        failWith('aer.notKept');
        return 'failed';
      }
      const changed = !sameTime(normalized.end, entry.end);
      rounded.current = changed ? normalized.end : null;
      if (alive.current) {
        // From now on this stored entry is the one being edited, so a second save replaces it.
        setOriginal(normalized);
        setEdited(null);
      }
      return changed ? 'rounded' : 'done';
    } finally {
      inflight.current = false;
    }
  };

  const remove = async (): Promise<boolean> => {
    if (!ready || !original || inflight.current) return false;
    inflight.current = true;
    try {
      const written = await write((current, at) => current.filter((_, i) => i !== at));
      if (!written) return false;
      if (!sameList(written.sent, written.readBack)) {
        failWith('aer.notKept');
        return false;
      }
      return true;
    } finally {
      inflight.current = false;
    }
  };

  const refresh = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorKey(null);
    try {
      await aer.refresh(deviceId);
    } catch (e) {
      failWith(PROBLEM_COPY[aerProblem(e)].line);
    }
    if (alive.current) setRefreshing(false);
  };

  return {
    stale,
    unknown,
    refreshing,
    isNew,
    draft,
    problems,
    sprays: sprayCount(draft),
    canSave: ready && problems.length === 0 && !saving,
    saving,
    errorKey,
    lastRoundedEnd: () => rounded.current,
    setStart: (start) => edit({ start }),
    setEnd: (end) => edit({ end }),
    toggleDay: (day) =>
      edit({
        days: sortDays(
          draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day],
        ),
      }),
    setInterval: (interval) => edit({ interval }),
    save,
    remove,
    refresh,
  };
}
