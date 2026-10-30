export interface Tokens {
  /** Dark backgrounds take light status bar icons. */
  dark: boolean;
  color: {
    bg: string;
    surface: string;
    surface2: string;
    ink: string;
    ink2: string;
    line: string;
    accent: string;
    accentInk: string;
    cool: string;
    warm: string;
    ok: string;
    danger: string;
  };
  /** The system font only; a weight picks the face. */
  font: {
    heading: { fontWeight: '700' };
    body: { fontWeight: '400' };
    bodyBold: { fontWeight: '700' };
  };
  size: { title: number; heading: number; body: number; caption: number };
  space: (n: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  shadow: {
    card: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
  touch: { min: 48 };
}

const base = {
  font: {
    heading: { fontWeight: '700' },
    body: { fontWeight: '400' },
    bodyBold: { fontWeight: '700' },
  },
  size: { title: 30, heading: 21, body: 16, caption: 13 },
  space: (n: number): number => n * 4,
  radius: { sm: 10, md: 18, lg: 26, pill: 999 },
  touch: { min: 48 },
} as const;

const shared = {
  cool: '#2f8ff6',
  warm: '#f2793a',
  ok: '#1f9d63',
  danger: '#e5484d',
} as const;

export const lightTokens: Tokens = {
  ...base,
  dark: false,
  color: {
    bg: '#eef0f3',
    surface: '#ffffff',
    surface2: '#f1f3f6',
    ink: '#15181d',
    ink2: '#5d6470',
    line: '#e2e5ea',
    accent: '#2f6df6',
    accentInk: '#ffffff',
    ...shared,
  },
  shadow: {
    card: {
      shadowColor: '#15181d',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
  },
};

export const darkTokens: Tokens = {
  ...base,
  dark: true,
  color: {
    bg: '#0d0f12',
    surface: '#1c2027',
    surface2: '#232832',
    ink: '#eef1f5',
    ink2: '#9aa3b2',
    line: '#2b313b',
    accent: '#6a96ff',
    accentInk: '#0d0f12',
    ...shared,
  },
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 2,
    },
  },
};

export type ColorToken = keyof Tokens['color'];
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type RadiusToken = keyof Tokens['radius'];
export type ShadowToken = keyof Tokens['shadow'];
