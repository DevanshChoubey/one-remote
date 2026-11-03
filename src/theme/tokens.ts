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
    okInk: string;
    dangerInk: string;
    scrim: string;
    accentSoft: string;
    okSoft: string;
    dangerSoft: string;
    warmSoft: string;
    dangerLine: string;
    accentPressed: string;
    surface2Pressed: string;
    toastErrorBg: string;
    toastErrorInk: string;
    toastOkIcon: string;
    /** White on the ok and danger discs. */
    onFill: string;
    cameraBg: string;
    cameraInk: string;
    cameraBeam: string;
    cameraLock: string;
    cameraBadge: string;
  };
  /** The system font only; a weight picks the face. */
  font: {
    heading: { fontWeight: '700' };
    body: { fontWeight: '400' };
    bodyBold: { fontWeight: '700' };
    semibold: { fontWeight: '600' };
  };
  size: {
    title: number;
    heading: number;
    body: number;
    caption: number;
    display: number;
    displaySup: number;
    label: number;
    /** Badge text (12). */
    badge: number;
    /** Banner text (14). */
    banner: number;
    /** Option card name (18). */
    cardName: number;
    /** OTP cell digit (26). */
    otp: number;
    /** Welcome empty-state title (30). */
    welcome: number;
    /** Pair ring number (32). */
    ring: number;
  };
  /** Pixel line heights per text variant. */
  lineHeight: {
    title: number;
    heading: number;
    body: number;
    label: number;
    caption: number;
    display: number;
  };
  tracking: { title: number; display: number };
  space: (n: number) => number;
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
    sheet: number;
    tile: number;
    art: number;
  };
  shadow: {
    card: ShadowStyle;
    pop: ShadowStyle;
    sheet: ShadowStyle;
  };
  touch: { min: 48; key: 56 };
  motion: {
    duration: {
      instant: number;
      fast: number;
      base: number;
      slow: number;
      ambient: number;
      spinner: number;
    };
    easing: {
      standard: Bezier;
      enter: Bezier;
      exit: Bezier;
      spring: Bezier;
    };
    stagger: number;
    lift: number;
  };
}

export type Bezier = readonly [number, number, number, number];

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

const base = {
  font: {
    heading: { fontWeight: '700' },
    body: { fontWeight: '400' },
    bodyBold: { fontWeight: '700' },
    semibold: { fontWeight: '600' },
  },
  size: {
    title: 30,
    heading: 21,
    body: 16,
    caption: 13,
    display: 76,
    displaySup: 28,
    label: 15,
    badge: 12,
    banner: 14,
    cardName: 18,
    otp: 26,
    welcome: 30,
    ring: 32,
  },
  lineHeight: { title: 35, heading: 25, body: 22, label: 20, caption: 18, display: 76 },
  tracking: { title: -0.45, display: -2.28 },
  space: (n: number): number => n * 4,
  radius: { sm: 10, md: 18, lg: 26, pill: 999, sheet: 28, tile: 14, art: 32 },
  touch: { min: 48, key: 56 },
  motion: {
    duration: { instant: 90, fast: 160, base: 260, slow: 380, ambient: 1500, spinner: 900 },
    easing: {
      standard: [0.2, 0, 0, 1],
      enter: [0.05, 0.7, 0.1, 1],
      exit: [0.3, 0, 0.8, 0.15],
      spring: [0.34, 1.45, 0.64, 1],
    },
    stagger: 45,
    lift: 14,
  },
} as const;

const shared = {
  cool: '#2f8ff6',
  warm: '#f2793a',
  ok: '#1f9d63',
  danger: '#e5484d',
} as const;

// The same in both themes.
const fixed = {
  toastOkIcon: '#4cc88c',
  onFill: '#ffffff',
  cameraBg: '#14181e',
  cameraInk: '#ffffff',
  cameraBeam: '#7fb0ff',
  cameraLock: '#4cc88c',
  cameraBadge: '#17744a',
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
    okInk: '#17744a',
    dangerInk: '#c4262c',
    scrim: 'rgba(13, 15, 18, 0.45)',
    accentSoft: '#e6edfe',
    okSoft: '#e0f1e9',
    dangerSoft: '#fce9ea',
    warmSoft: '#fdeadf',
    dangerLine: '#f4b1b3',
    accentPressed: '#285ed4',
    surface2Pressed: '#dfe1e5',
    toastErrorBg: '#c4262c',
    toastErrorInk: '#ffffff',
    ...fixed,
  },
  shadow: {
    card: {
      shadowColor: '#15181d',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    pop: {
      shadowColor: '#15181d',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 28,
      elevation: 8,
    },
    sheet: {
      shadowColor: '#15181d',
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.22,
      shadowRadius: 40,
      elevation: 16,
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
    okInk: '#4cc88c',
    dangerInk: '#ff8b8f',
    scrim: 'rgba(0, 0, 0, 0.6)',
    accentSoft: '#252e41',
    okSoft: '#1c322f',
    dangerSoft: '#34252c',
    warmSoft: '#3e2e2a',
    dangerLine: '#723138',
    accentPressed: '#5b81db',
    surface2Pressed: '#333842',
    toastErrorBg: '#5a1d20',
    toastErrorInk: '#ffd9da',
    ...fixed,
  },
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 2,
    },
    pop: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.55,
      shadowRadius: 28,
      elevation: 8,
    },
    sheet: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: 0.6,
      shadowRadius: 40,
      elevation: 16,
    },
  },
};

export type ColorToken = keyof Tokens['color'];
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type RadiusToken = keyof Tokens['radius'];
export type ShadowToken = keyof Tokens['shadow'];
