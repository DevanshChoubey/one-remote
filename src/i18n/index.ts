import common from './en/common';
import home from './en/home';

const namespaces: Record<string, Record<string, string>> = {
  common,
  home,
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
