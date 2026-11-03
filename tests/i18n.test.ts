import * as fs from 'fs';
import * as path from 'path';
import { interpolate, t } from '@/i18n';
import ac from '@/i18n/en/ac';
import addAppliance from '@/i18n/en/addAppliance';
import add from '@/i18n/en/add';
import addTv from '@/i18n/en/addTv';
import common from '@/i18n/en/common';
import device from '@/i18n/en/device';
import fan from '@/i18n/en/fan';
import home from '@/i18n/en/home';
import ir from '@/i18n/en/ir';
import irBackup from '@/i18n/en/irBackup';
import matter from '@/i18n/en/matter';
import settings from '@/i18n/en/settings';
import tv from '@/i18n/en/tv';

const NAMESPACES: Record<string, Record<string, string>> = {
  common,
  home,
  add,
  device,
  settings,
  tv,
  addTv,
  ac,
  fan,
  addAppliance,
  irBackup,
  ir,
  matter,
};

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

  it('has the mock copy', () => {
    expect(common.tagline).toBe('Nothing leaves your home network.');
    expect(common.openSettings).toBe('Open Settings');
    expect(common.saved).toBe('Saved');
    expect(addTv.pairedFirst).toBe('Paired');
    expect(addTv.paired).toBe('Paired again');
    expect(addTv.localNetworkOff).toBe(
      'Local Network is off for One Remote. Turn it on in Settings › Privacy & Security › Local Network.',
    );
    expect(device.removed).toBe('Device removed');
    expect(ac.offHint).toBe('Tap power to turn on');
    expect(tv.inputNow).toBe('Now');
    expect(tv.voiceSent).toBe('Sent to the TV');
    expect([ac['mode.cool'], ac['mode.dry'], ac['mode.fan'], ac['mode.auto']]).toEqual([
      'Cool',
      'Dry',
      'Fan',
      'Auto',
    ]);
    expect([ac.swing, ac.sleep]).toEqual(['Swing', 'Sleep']);
    expect(ac['status.connected']).toBe("Connected · how it's connected");
    expect([fan.boost, fan.sleep, fan.light]).toEqual(['Boost', 'Sleep', 'Light']);
    expect(fan['status.connected']).toBe("Connected · how it's connected");
  });

  it('has no emoji or glyph prefixes in AC and fan labels', () => {
    for (const v of [...Object.values(ac), ...Object.values(fan)]) {
      expect(v).not.toMatch(/[←-⯿\u{1F300}-\u{1FAFF}●]/u);
    }
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
      for (const m of text.matchAll(/\bt\(\s*'([A-Za-z]+)\.([A-Za-z0-9.]+)'/g)) {
        const [, ns, key] = m;
        if (ns === undefined || key === undefined || NAMESPACES[ns]?.[key] === undefined) {
          missing.push(`${path.relative(ROOT, file)}: ${ns}.${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
