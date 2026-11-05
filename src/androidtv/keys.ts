import type { TvKey } from '@/core';

/** Android `KeyEvent` codes for the remote's keys. */
export const KEYCODE: Record<TvKey, number> = {
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  ok: 23,
  back: 4,
  home: 3,
  mute: 164,
  volumeUp: 24,
  volumeDown: 25,
  playPause: 85,
  input: 178,
  power: 26,
};

/** `KEYCODE_SEARCH`: on a TV that negotiated voice, it starts the assistant's voice session. */
export const KEYCODE_SEARCH = 84;

/** Package to title. Unknown packages have no title (never a guessed name). */
export const APP_TITLES: Record<string, string> = {
  'com.google.android.youtube.tv': 'YouTube',
  'com.netflix.ninja': 'Netflix',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'in.startv.hotstar': 'JioHotstar',
  'tv.accedo.airtel.wynk': 'Airtel Xstream',
  'com.android.tv.settings': 'Settings',
  'com.google.android.tvlauncher': 'Home',
  'com.google.android.apps.tv.launcherx': 'Home',
};
