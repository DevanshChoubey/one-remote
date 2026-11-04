// From aer-remote src/alerts/engine.ts (2026-11-04). Adapted: Alerts moved to ./types, imports point at @/aer, copy keys are aerAlerts.*, one switch per group (plans skip kinds whose group is off).
import { batteryPercent } from '@/aer/protocol/status';
import type { DispenserStore, SavedDispenser } from '@/aer/types';
import { t } from '@/i18n';
import { groupOf, planAlerts } from './plan';
import type { AlertKind, PlannedAlert } from './plan';
import type { AlertState, AlertStateStore } from './state';
import type { AlertGroup, Alerts, AlertScheduler, AlertSwitches } from './types';

export interface AlertsDeps {
  store: DispenserStore;
  scheduler: AlertScheduler;
  state: AlertStateStore;
  now?: () => Date;
  phoneTimeZone?: () => string;
}

const GROUPS: AlertGroup[] = ['refill', 'battery', 'checkIn'];
const BATTERY_CYCLE = 'set';
const BATTERY_REARM_PERCENT = 30;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps only entries shaped like a delivered alert; anything else counts as absent. */
function cleanState(raw: unknown): AlertState {
  const clean: AlertState = {};
  if (!isRecord(raw)) return clean;
  for (const [key, v] of Object.entries(raw)) {
    if (!isRecord(v) || typeof v.cycle !== 'string') continue;
    if (typeof v.at !== 'string' && typeof v.at !== 'number') continue;
    const ms = new Date(v.at).getTime();
    if (!Number.isFinite(ms)) continue;
    clean[key] = { at: new Date(ms).toISOString(), cycle: v.cycle };
  }
  return clean;
}

const dispenserIdOf = (key: string): string => key.slice(0, Math.max(key.lastIndexOf(':'), 0));

/** Each severe kind with the milder kind it supersedes. */
const SEVERE_OVER: Partial<Record<AlertKind, AlertKind>> = {
  batteryFlat: 'batteryLow',
  refillOut: 'refillLow',
};

function cycleFor(kind: AlertKind, d: SavedDispenser): string {
  const status = d.lastStatus;
  if (kind === 'refillLow' || kind === 'refillOut') return String(status?.spraysSinceRefill ?? 0);
  if (kind === 'checkIn') return status?.at ?? '';
  return BATTERY_CYCLE;
}

/** A cancelled alert that never fired is not delivered: forget its state. */
function forgetUnfired(delivered: AlertState, key: string, now: Date): boolean {
  const d = delivered[key];
  if (d === undefined || new Date(d.at).getTime() <= now.getTime()) return false;
  delete delivered[key];
  return true;
}

function warn(what: string, e: unknown): void {
  console.warn(what, e);
}

export function createAlerts(deps: AlertsDeps): Alerts {
  const { store, scheduler, state } = deps;
  const now = deps.now ?? ((): Date => new Date());
  const phoneTimeZone =
    deps.phoneTimeZone ?? ((): string => Intl.DateTimeFormat().resolvedOptions().timeZone);
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs `job` after everything queued so far; never rejects and never blocks the next job. */
  const enqueue = (job: () => Promise<void>): Promise<void> => {
    const run = tail.then(job).catch((e: unknown) => warn('Alert sync failed', e));
    tail = run;
    return run;
  };

  const attempt = async (what: string, op: () => Promise<unknown>): Promise<boolean> => {
    try {
      await op();
      return true;
    } catch (e) {
      warn(what, e);
      return false;
    }
  };

  /**
   * 'auto' asks only if the app never asked on its own before; 'always' asks whenever the phone
   * allows it (the user turned the switch on); 'never' does not ask.
   */
  const syncOnce = async (ask: 'never' | 'auto' | 'always'): Promise<void> => {
    const switches = await state.switches();
    if (!GROUPS.some((g) => switches[g])) return;
    const at = now();
    const dispensers = await store.list();
    const saved = new Set(dispensers.map((d) => d.id));
    const delivered = cleanState(await state.load());
    let changed = false;
    const pending = await scheduler.pendingKeys();

    // Gone dispensers: cancel their pending alerts and forget their state.
    for (const key of pending) {
      if (!saved.has(dispenserIdOf(key)))
        await attempt('Could not cancel an alert', () => scheduler.cancel(key));
    }
    for (const key of Object.keys(delivered)) {
      if (saved.has(dispenserIdOf(key))) continue;
      delete delivered[key];
      changed = true;
    }

    const collapses: { key: string; cycle: string; severeKey: string; severeDone: boolean }[] = [];
    const toSchedule: { alert: PlannedAlert; dispenser: SavedDispenser }[] = [];
    for (const dispenser of dispensers) {
      const status = dispenser.lastStatus;
      const id = dispenser.id;
      const planned = planAlerts({
        dispenser,
        now: at,
        phoneTimeZone: phoneTimeZone(),
      }).filter((p) => switches[groupOf(p.kind)]);
      const byKind = new Map(planned.map((p) => [p.kind, p]));
      const forget = (kind: AlertKind): void => {
        const key = `${id}:${kind}`;
        if (key in delivered) {
          delete delivered[key];
          changed = true;
        }
      };

      // Re-arm: a new can, new batteries or a newer reading start a fresh cycle.
      if (status) {
        for (const kind of ['refillLow', 'refillOut'] as const) {
          const stored = Number(delivered[`${id}:${kind}`]?.cycle);
          if (status.spraysSinceRefill < stored) forget(kind);
        }
        const batteryPct = batteryPercent(status.batteryMv);
        if (batteryPct > BATTERY_REARM_PERCENT) {
          forget('batteryLow');
          forget('batteryFlat');
        }
        if (delivered[`${id}:checkIn`]?.cycle !== status.at) forget('checkIn');
      }

      const isDelivered = (kind: AlertKind): boolean => {
        const d = delivered[`${id}:${kind}`];
        return d !== undefined && new Date(d.at).getTime() <= at.getTime();
      };

      // Severe only: when the worse alert is due with its milder one, announce the worse and
      // count the milder as delivered for this cycle so it does not fire later.
      const dropped = new Set<AlertKind>();
      for (const [severe, milder] of Object.entries(SEVERE_OVER) as [AlertKind, AlertKind][]) {
        const worse = byKind.get(severe);
        const mild = byKind.get(milder);
        if (!worse || !mild || isDelivered(milder) || worse.at.getTime() > mild.at.getTime())
          continue;
        collapses.push({
          key: mild.key,
          cycle: cycleFor(milder, dispenser),
          severeKey: worse.key,
          severeDone: isDelivered(severe),
        });
        dropped.add(milder);
      }
      for (const alert of planned) {
        if (isDelivered(alert.kind) || dropped.has(alert.kind)) continue;
        toSchedule.push({ alert, dispenser });
      }
    }

    // Cancel pending alerts that are no longer planned (or no longer due).
    const wanted = new Set(toSchedule.map((s) => s.alert.key));
    for (const key of pending) {
      if (saved.has(dispenserIdOf(key)) && !wanted.has(key)) {
        await attempt('Could not cancel an alert', () => scheduler.cancel(key));
        if (forgetUnfired(delivered, key, at)) changed = true;
      }
    }

    const scheduledKeys = new Set<string>();
    let permission = await scheduler.permission();
    if (toSchedule.length > 0 && permission === 'undetermined' && ask !== 'never') {
      if (ask === 'always' || !(await state.asked())) {
        await attempt('Could not save that the app asked', () => state.setAsked());
        permission = await scheduler.requestPermission();
      }
    }
    if (permission === 'granted') {
      for (const { alert, dispenser } of toSchedule) {
        const vars = { name: dispenser.name };
        const ok = await attempt('Could not schedule an alert', () =>
          scheduler.schedule({
            key: alert.key,
            dispenserId: alert.dispenserId,
            at: alert.at,
            title: t(`aerAlerts.${alert.kind}Title`),
            body: t(`aerAlerts.${alert.kind}`, vars),
          }),
        );
        if (!ok) continue;
        scheduledKeys.add(alert.key);
        delivered[alert.key] = {
          at: alert.at.toISOString(),
          cycle: cycleFor(alert.kind, dispenser),
        };
        changed = true;
      }
    }
    // Count the milder alert as delivered only once the worse one is out or already delivered.
    for (const c of collapses) {
      if (!c.severeDone && !scheduledKeys.has(c.severeKey)) continue;
      delivered[c.key] = { at: at.toISOString(), cycle: c.cycle };
      changed = true;
    }
    if (changed) await attempt('Could not save the alert state', () => state.save(delivered));
  };

  const sync = ({ mayAsk }: { mayAsk: boolean }): Promise<void> =>
    enqueue(() => syncOnce(mayAsk ? 'auto' : 'never'));

  return {
    start() {
      void sync({ mayAsk: false });
      return store.subscribe(() => {
        void sync({ mayAsk: true });
      });
    },
    sync,
    switches: () => state.switches(),
    setSwitch: (group, on) =>
      enqueue(async () => {
        await attempt('Could not save the alert switch', () => state.setSwitch(group, on));
        const current: AlertSwitches = await state.switches();
        // The write may have failed: judge by what is stored plus this change.
        const after = { ...current, [group]: on };
        if (on) {
          await syncOnce('always');
        } else if (GROUPS.some((g) => after[g])) {
          await syncOnce('never');
        } else {
          await attempt('Could not cancel alerts', () => scheduler.cancelAll());
          await attempt('Could not save the alert state', async () => {
            const kept = cleanState(await state.load());
            let changed = false;
            for (const key of Object.keys(kept)) {
              if (forgetUnfired(kept, key, now())) changed = true;
            }
            if (changed) await state.save(kept);
          });
        }
      }),
    permission: () => scheduler.permission(),
    pendingKeys: () => scheduler.pendingKeys(),
    onOpen(cb) {
      return scheduler.onOpen((id) => {
        void (async () => {
          try {
            cb((await store.get(id)) ? id : null);
          } catch (e) {
            warn('Could not look up the opened dispenser', e);
            cb(null);
          }
        })();
      });
    },
  };
}
