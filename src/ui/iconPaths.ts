export type IconShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number; filled?: boolean; noStroke?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number };

/** Paths copied verbatim from the mock's <symbol>s (viewBox 0 0 24 24, stroke currentColor). */
export const ICON_SHAPES = {
  back: [{ t: 'path', d: 'M15 5l-7 7 7 7' }],
  chev: [{ t: 'path', d: 'M9 5l7 7-7 7' }],
  up: [{ t: 'path', d: 'M5 15l7-7 7 7' }],
  down: [{ t: 'path', d: 'M5 9l7 7 7-7' }],
  left: [{ t: 'path', d: 'M15 5l-7 7 7 7' }],
  right: [{ t: 'path', d: 'M9 5l7 7-7 7' }],
  close: [{ t: 'path', d: 'M6 6l12 12M18 6L6 18' }],
  plus: [{ t: 'path', d: 'M12 5v14M5 12h14' }],
  minus: [{ t: 'path', d: 'M5 12h14' }],
  check: [{ t: 'path', d: 'M5 12.5l4.5 4.5L19 7.5' }],
  gear: [
    { t: 'circle', cx: 12, cy: 12, r: 3 },
    {
      t: 'path',
      d: 'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    },
  ],
  power: [
    { t: 'path', d: 'M12 3v8' },
    { t: 'path', d: 'M7 6.3a8 8 0 1010 0' },
  ],
  more: [
    { t: 'circle', cx: 12, cy: 5, r: 1.6, filled: true, noStroke: true },
    { t: 'circle', cx: 12, cy: 12, r: 1.6, filled: true, noStroke: true },
    { t: 'circle', cx: 12, cy: 19, r: 1.6, filled: true, noStroke: true },
  ],
  keyboard: [
    { t: 'rect', x: 2.5, y: 6, w: 19, h: 12, rx: 2.5 },
    { t: 'path', d: 'M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9' },
  ],
  mic: [
    { t: 'rect', x: 9, y: 3, w: 6, h: 11, rx: 3 },
    { t: 'path', d: 'M5.5 11a6.5 6.5 0 0013 0M12 17.5V21' },
  ],
  home: [
    { t: 'path', d: 'M4 11l8-7 8 7v8.5a1.5 1.5 0 01-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 014 19.5z' },
  ],
  tv: [
    { t: 'rect', x: 2.5, y: 4.5, w: 19, h: 12.5, rx: 2.5 },
    { t: 'path', d: 'M8 21h8M12 17v4' },
  ],
  ac: [
    { t: 'rect', x: 2.5, y: 4.5, w: 19, h: 8, rx: 2.5 },
    {
      t: 'path',
      d: 'M6 16.5c0 1.5-1 1.5-1 3M12 16.5c0 1.5-1 1.5-1 3M18 16.5c0 1.5-1 1.5-1 3M6.5 8.5h6',
    },
  ],
  fan: [
    { t: 'circle', cx: 12, cy: 12, r: 1.8 },
    {
      t: 'path',
      d: 'M12 10.2C10.6 6 11.2 3.5 13.5 3.5c2 0 2.2 3 -1.5 6.7zM13.8 12c4.2-1.4 6.7-.8 6.7 1.5 0 2-3 2.2-6.7-1.5zM12 13.8c1.4 4.2.8 6.7-1.5 6.7-2 0-2.2-3 1.5-6.7zM10.2 12C6 13.4 3.5 12.8 3.5 10.5c0-2 3-2.2 6.7 1.5z',
    },
  ],
  wifi: [
    { t: 'path', d: 'M2.5 9a15 15 0 0119 0M5.5 12.5a10.5 10.5 0 0113 0M8.7 16a6 6 0 016.6 0' },
    { t: 'circle', cx: 12, cy: 19.4, r: 1, filled: true },
  ],
  wifioff: [
    {
      t: 'path',
      d: 'M3 3l18 18M2.5 9a15 15 0 015-3M10 5.2a15 15 0 0111.5 3.8M5.5 12.5a10.5 10.5 0 013-2M13 10.1a10.5 10.5 0 015.5 2.4M8.7 16a6 6 0 015.5-1',
    },
    { t: 'circle', cx: 12, cy: 19.4, r: 1, filled: true },
  ],
  alert: [
    { t: 'path', d: 'M12 3.5l9.5 16.5h-19z' },
    { t: 'path', d: 'M12 10v4.5M12 17.5h.01' },
  ],
  info: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 11v5.5M12 7.8h.01' },
  ],
  camera: [
    {
      t: 'path',
      d: 'M3.5 8.5A2 2 0 015.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2z',
    },
    { t: 'circle', cx: 12, cy: 13, r: 3.8 },
  ],
  cameraoff: [
    {
      t: 'path',
      d: 'M3 3l18 18M8 6.5l1-2h6l1.5 2h2a2 2 0 012 2v8M17.5 19.5h-12a2 2 0 01-2-2v-9a2 2 0 012-2',
    },
    { t: 'path', d: 'M9.7 10.2A3.8 3.8 0 0015.8 14' },
  ],
  clip: [
    { t: 'rect', x: 5, y: 4.5, w: 14, h: 17, rx: 2.5 },
    { t: 'path', d: 'M9 4.5V3.5h6v1M9 11h6M9 15h4' },
  ],
  swing: [{ t: 'path', d: 'M12 3v18M7.5 7.5L12 3l4.5 4.5M7.5 16.5L12 21l4.5-4.5' }],
  moon: [{ t: 'path', d: 'M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z' }],
  bolt: [{ t: 'path', d: 'M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z' }],
  bulb: [
    {
      t: 'path',
      d: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z',
    },
  ],
  snow: [
    {
      t: 'path',
      d: 'M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5',
    },
  ],
  drop: [{ t: 'path', d: 'M12 3.5s6.5 6.4 6.5 11a6.5 6.5 0 01-13 0c0-4.6 6.5-11 6.5-11z' }],
  wind: [{ t: 'path', d: 'M3 9h10.5a2.5 2.5 0 10-2.4-3.2M3 15h14a2.5 2.5 0 11-2.4 3.2M3 12h17' }],
  auto: [{ t: 'path', d: 'M6 19L12 5l6 14M8.3 14h7.4' }],
  trash: [{ t: 'path', d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }],
  input: [{ t: 'path', d: 'M3 12h13M12 7l5 5-5 5M21 4v16' }],
  lock: [
    { t: 'rect', x: 5, y: 10.5, w: 14, h: 10, rx: 2.5 },
    { t: 'path', d: 'M8 10.5V8a4 4 0 018 0v2.5' },
  ],
  room: [{ t: 'path', d: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6' }],
  ir: [
    { t: 'path', d: 'M12 14.5v6M8.5 6.8a5 5 0 017 0M5.5 4a9 9 0 0113 0' },
    { t: 'rect', x: 8, y: 9.5, w: 8, h: 5, rx: 2.5 },
  ],
  play: [{ t: 'path', d: 'M7 4.5v15l12-7.5z' }],
  refresh: [{ t: 'path', d: 'M20 12a8 8 0 11-2.6-5.9M20 4v5h-5' }],
  aer: [
    { t: 'rect', x: 6.5, y: 2.5, w: 11, h: 19, rx: 3.5 },
    { t: 'path', d: 'M10 6.5h4' },
    { t: 'circle', cx: 12, cy: 14.5, r: 2.5 },
  ],
  spray: [
    { t: 'rect', x: 2.5, y: 9.5, w: 7, h: 5, rx: 1.5 },
    { t: 'path', d: 'M9.5 12h2' },
    { t: 'circle', cx: 15, cy: 12, r: 0.9, filled: true },
    { t: 'circle', cx: 18.5, cy: 12, r: 0.9, filled: true },
    { t: 'circle', cx: 21, cy: 12, r: 0.9, filled: true },
    { t: 'circle', cx: 15.5, cy: 8.5, r: 0.9, filled: true },
    { t: 'circle', cx: 19, cy: 6.5, r: 0.9, filled: true },
    { t: 'circle', cx: 15.5, cy: 15.5, r: 0.9, filled: true },
    { t: 'circle', cx: 19, cy: 17.5, r: 0.9, filled: true },
  ],
  bt: [{ t: 'path', d: 'M7 7.5l10 9-5 4.5V3l5 4.5-10 9' }],
  btoff: [
    {
      t: 'path',
      d: 'M3 3l18 18M12 12v9l4.2-3.8M12 8V3l5 4.5-2.6 2.3M7 7.5l5 4.5-5 4.5',
    },
  ],
  battery: [
    { t: 'rect', x: 2.5, y: 7, w: 17, h: 10, rx: 2.5 },
    { t: 'path', d: 'M22 10.5v3M6 10.5v3' },
  ],
  clock: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 7v5l3.5 2' },
  ],
  globe: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    {
      t: 'path',
      d: 'M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z',
    },
  ],
  bell: [{ t: 'path', d: 'M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 21h4' }],
} as const satisfies Record<string, readonly IconShape[]>;
