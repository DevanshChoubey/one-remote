import type { NativeStackNavigationOptions } from 'expo-router';
import type { Motion, Tokens } from '@/theme';

/**
 * Screen options for the root stack: pushes slide in from the right (380 ms on Android; iOS keeps
 * the system push), or cross-fade under reduced motion. The scene background follows the theme so
 * a push never flashes the wrong colour.
 */
export function stackOptions(theme: Tokens, motion: Motion): NativeStackNavigationOptions {
  return {
    headerShown: false,
    animation: motion.reduced ? 'fade' : 'slide_from_right',
    animationDuration: motion.reduced ? 260 : 380,
    contentStyle: { backgroundColor: theme.color.bg },
  };
}

/**
 * The device-settings sheet animates itself, so the route adds no transition of its own. Its scene
 * is see-through (the stack's default `contentStyle` paints the theme background), so the screen
 * behind shows faintly under the sheet's 45% scrim instead of vanishing.
 */
export const SHEET_ROUTE_OPTIONS = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const;
