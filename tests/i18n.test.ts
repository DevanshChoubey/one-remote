import * as fs from 'fs';
import * as path from 'path';
import { interpolate, t } from '@/i18n';
import add from '@/i18n/en/add';
import common from '@/i18n/en/common';
import device from '@/i18n/en/device';
import home from '@/i18n/en/home';
import settings from '@/i18n/en/settings';

const NAMESPACES: Record<string, Record<string, string>> = { common, home, add, device, settings };

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('i18n', () => {
  it('returns the app name', () => {
    expect(t('common.appName')).toBe('One Remote');
  });

  describe('interpolate', () => {
    it('replaces a variable', () => {
      expect(interpolate('Hi {name}', { name: 'Sam' })).toBe('Hi Sam');
      expect(interpolate('{n}%', { n: 42 })).toBe('42%');
    });

    it('replaces a repeated variable everywhere', () => {
      expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x');
    });

    it('throws on a missing variable in dev, naming the key', () => {
      expect(() => interpolate('Hi {name}', {}, 'common.hi')).toThrow(/\{name\}.*common\.hi/);
    });

    it('leaves a missing variable in place in prod', () => {
      const g = globalThis as { __DEV__?: boolean };
      const was = g.__DEV__;
      g.__DEV__ = false;
      try {
        expect(interpolate('Hi {name}')).toBe('Hi {name}');
      } finally {
        g.__DEV__ = was;
      }
    });
  });

  it('throws on a missing key in dev', () => {
    expect(() => t('common.nope')).toThrow(/Missing translation key/);
    expect(() => t('nonsense.key')).toThrow();
  });

  it('does not resolve inherited object keys', () => {
    expect(() => t('common.toString')).toThrow(/Missing translation key/);
    expect(() => t('constructor.name')).toThrow();
  });

  it('has no empty strings', () => {
    for (const [ns, entries] of Object.entries(NAMESPACES)) {
      for (const [k, v] of Object.entries(entries)) {
        expect(`${ns}.${k}:${v.trim().length > 0}`).toBe(`${ns}.${k}:true`);
      }
    }
  });

  it('defines every key referenced as t(...) in src and app', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))];
    const missing: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'([a-z]+)\.([A-Za-z0-9]+)'/g)) {
        const [, ns, key] = m;
        if (ns === undefined || key === undefined || NAMESPACES[ns]?.[key] === undefined) {
          missing.push(`${path.relative(ROOT, file)}: ${ns}.${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
