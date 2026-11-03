import { darkTokens, lightTokens } from '@/theme';
import type { Tokens } from '@/theme';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = (c ?? 0) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('tokens', () => {
  it('has the mockup values', () => {
    expect(lightTokens.color.accent).toBe('#2f6df6');
    expect(lightTokens.color.bg).toBe('#eef0f3');
    expect(lightTokens.color.surface2).toBe('#f1f3f6');
    expect(lightTokens.color.line).toBe('#e2e5ea');
    expect(darkTokens.color.bg).toBe('#0d0f12');
    expect(darkTokens.color.accent).toBe('#6a96ff');
    expect(darkTokens.color.accentInk).toBe('#0d0f12');
    expect(lightTokens.touch.min).toBe(48);
  });

  it('has the new mock tokens', () => {
    const table: Record<string, [string, string]> = {
      okInk: ['#17744a', '#4cc88c'],
      dangerInk: ['#c4262c', '#ff8b8f'],
      scrim: ['rgba(13, 15, 18, 0.45)', 'rgba(0, 0, 0, 0.6)'],
      accentSoft: ['#e6edfe', '#252e41'],
      okSoft: ['#e0f1e9', '#1c322f'],
      dangerSoft: ['#fce9ea', '#34252c'],
      warmSoft: ['#fdeadf', '#3e2e2a'],
      dangerLine: ['#f4b1b3', '#723138'],
      accentPressed: ['#285ed4', '#5b81db'],
      surface2Pressed: ['#dfe1e5', '#333842'],
      toastErrorBg: ['#c4262c', '#5a1d20'],
      toastErrorInk: ['#ffffff', '#ffd9da'],
      toastOkIcon: ['#4cc88c', '#4cc88c'],
      onFill: ['#ffffff', '#ffffff'],
      cameraBg: ['#14181e', '#14181e'],
      cameraInk: ['#ffffff', '#ffffff'],
      cameraBeam: ['#7fb0ff', '#7fb0ff'],
      cameraLock: ['#4cc88c', '#4cc88c'],
      cameraBadge: ['#17744a', '#17744a'],
    };
    for (const [key, [light, dark]] of Object.entries(table)) {
      expect(lightTokens.color[key as keyof Tokens['color']]).toBe(light);
      expect(darkTokens.color[key as keyof Tokens['color']]).toBe(dark);
    }
    expect(lightTokens.radius).toMatchObject({ sheet: 28, tile: 14, art: 32 });
    expect(lightTokens.size).toMatchObject({ display: 76, displaySup: 28, label: 15 });
    expect(lightTokens.lineHeight).toEqual({
      title: 35,
      heading: 25,
      body: 22,
      label: 20,
      caption: 18,
      display: 76,
    });
    expect(lightTokens.tracking).toEqual({ title: -0.45, display: -2.28 });
    expect(lightTokens.touch).toEqual({ min: 48, key: 56 });
    expect(lightTokens.touch.key).toBe(56);
    expect(lightTokens.motion.duration).toEqual({
      instant: 90,
      fast: 160,
      base: 260,
      slow: 380,
      ambient: 1500,
      spinner: 900,
    });
    expect(lightTokens.motion.duration.slow).toBe(380);
    expect(lightTokens.motion.easing.enter).toEqual([0.05, 0.7, 0.1, 1]);
    expect(lightTokens.motion.easing.standard).toEqual([0.2, 0, 0, 1]);
    expect(lightTokens.motion.easing.exit).toEqual([0.3, 0, 0.8, 0.15]);
    expect(lightTokens.motion.easing.spring).toEqual([0.34, 1.45, 0.64, 1]);
    expect(lightTokens.motion.stagger).toBe(45);
    expect(lightTokens.motion.lift).toBe(14);
    expect(lightTokens.shadow.pop).toEqual({
      shadowColor: '#15181d',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 28,
      elevation: 8,
    });
    expect(darkTokens.shadow.sheet).toEqual({
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.6,
      shadowRadius: 40,
      elevation: 16,
    });
    expect(lightTokens.shadow.sheet.shadowOpacity).toBe(0.22);
    expect(darkTokens.shadow.pop.shadowOpacity).toBe(0.55);
  });

  it('keeps the other dark colours at the light values', () => {
    for (const k of ['cool', 'warm', 'ok', 'danger'] as const) {
      expect(darkTokens.color[k]).toBe(lightTokens.color[k]);
    }
  });

  it('uses the system font only', () => {
    expect(Object.keys(lightTokens.font).sort()).toEqual(['body', 'bodyBold', 'heading']);
    expect(JSON.stringify(lightTokens.font)).not.toMatch(/fontFamily/);
  });

  it('dark tokens have the same keys as light tokens', () => {
    expect(keyPaths(darkTokens).sort()).toEqual(keyPaths(lightTokens).sort());
  });

  it('marks which themes are dark', () => {
    expect([lightTokens.dark, darkTokens.dark]).toEqual([false, true]);
  });

  describe.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ] as [string, Tokens][])('%s contrast (WCAG AA)', (_name, tokens) => {
    const pairs: [keyof Tokens['color'], keyof Tokens['color']][] = [
      ['ink', 'bg'],
      ['ink', 'surface'],
      ['ink', 'surface2'],
      ['ink2', 'bg'],
      ['ink2', 'surface'],
      ['accent', 'surface'],
      ['accentInk', 'accent'],
      ['okInk', 'surface'],
      ['okInk', 'bg'],
      ['dangerInk', 'surface'],
      ['dangerInk', 'bg'],
      ['okInk', 'okSoft'],
      ['dangerInk', 'dangerSoft'],
      ['ink', 'warmSoft'],
      ['toastErrorInk', 'toastErrorBg'],
    ];
    it.each(pairs)('%s on %s >= 4.5', (fg, bg) => {
      expect(contrast(tokens.color[fg], tokens.color[bg])).toBeGreaterThanOrEqual(4.5);
    });
    // Non-text contrast (WCAG 1.4.11): the off switch must be visible against the page.
    it('off track (ink2) on bg >= 3', () => {
      expect(contrast(tokens.color.ink2, tokens.color.bg)).toBeGreaterThanOrEqual(3);
    });
    it('thumb (surface) on off track >= 3', () => {
      expect(contrast(tokens.color.surface, tokens.color.ink2)).toBeGreaterThanOrEqual(3);
    });
    it('thumb (surface) on accent track >= 3', () => {
      expect(contrast(tokens.color.surface, tokens.color.accent)).toBeGreaterThanOrEqual(3);
    });
  });
});
