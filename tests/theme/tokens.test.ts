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
