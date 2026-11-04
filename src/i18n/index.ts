import ac from './en/ac';
import aer from './en/aer';
import aerAlerts from './en/aerAlerts';
import addAppliance from './en/addAppliance';
import add from './en/add';
import addTv from './en/addTv';
import common from './en/common';
import device from './en/device';
import fan from './en/fan';
import home from './en/home';
import ir from './en/ir';
import irBackup from './en/irBackup';
import matter from './en/matter';
import settings from './en/settings';
import tv from './en/tv';

const namespaces: Record<string, Record<string, string>> = {
  common,
  ac,
  fan,
  addAppliance,
  irBackup,
  ir,
  matter,
  aer,
  aerAlerts,
  home,
  add,
  addTv,
  device,
  settings,
  tv,
};

/** Replaces every {name} in the template. A missing variable throws in dev and stays as {name} in prod. */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
  key = 'template',
): string {
  return template.replace(/\{(\w+)\}/g, (whole, v: string) => {
    const value = vars && Object.hasOwn(vars, v) ? vars[v] : undefined;
    if (value !== undefined) return String(value);
    if (__DEV__) throw new Error(`Missing variable {${v}} for translation key: ${key}`);
    return whole;
  });
}

/** Dev: throws on a missing key. Prod: returns the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dot = key.indexOf('.');
  const ns = dot > 0 ? key.slice(0, dot) : '';
  const name = key.slice(dot + 1);
  const entries = Object.hasOwn(namespaces, ns) ? namespaces[ns] : undefined;
  const template = entries && Object.hasOwn(entries, name) ? entries[name] : undefined;
  if (template === undefined) {
    if (__DEV__) throw new Error(`Missing translation key: ${key}`);
    return key;
  }
  return interpolate(template, vars, key);
}
