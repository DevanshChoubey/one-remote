import type { TvKey } from '@/core';

/** Samsung `KEY_*` names for every remote key but play/pause (see `PLAY_PAUSE_CYCLE`). */
export const KEY_NAME: Record<Exclude<TvKey, 'playPause'>, string> = {
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  ok: 'KEY_ENTER',
  back: 'KEY_RETURN',
  home: 'KEY_HOME',
  mute: 'KEY_MUTE',
  volumeUp: 'KEY_VOLUP',
  volumeDown: 'KEY_VOLDOWN',
  // The TV's own source picker: Samsung lists no inputs to the remote.
  input: 'KEY_SOURCE',
  // A toggle; turning on is Wake-on-LAN.
  power: 'KEY_POWER',
};

/** Play/pause alternates these two, starting with pause (builder's pick, confirm on the first
 *  Samsung run): the published key lists have no single toggle key. */
export const PLAY_PAUSE_CYCLE = ['KEY_PAUSE', 'KEY_PLAY'] as const;
