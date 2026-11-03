# App matches the central mock: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. This plan runs in **waves**: Wave 0 is one agent, Wave 1 is ten agents at once
> (one git worktree each), Wave 2 is one integration agent.

**Goal:** Restyle and re-animate every screen of One Remote (Home, TV, voice, AC, fan, add flows,
Matter, device settings, settings, launch) so the app matches `docs/design/one-remote-mockup.html`
in light, dark and reduced motion, without breaking any behaviour, test selector or accessibility role.

**Architecture:** Wave 0 adds `react-native-svg`, proves svg + Reanimated 4 work on SDK 58, adds the
new tokens and a `useMotion()` hook, draws the 41-icon set, and writes **every shared UI component's
final props interface with a plain, unanimated body** (plus all new copy and every cross-task prop
change). Wave 1 then runs ten tasks in parallel: three bring the shared components to mock fidelity
(motion, pressed states), seven restyle screens against the Wave 0 interfaces. Feature-only visuals
(dial, radar, camera frame...) live in `src/ui/<feature>/` and are owned by one task each, so no file
has two owners. Wave 2 merges, applies collected mock edits, and checks a release build on the phone.

**Tech stack:** Expo SDK 58, React Native 0.88 (New Architecture), TypeScript, expo-router (native
stack), react-native-reanimated 4.7.1 + react-native-worklets 0.13, react-native-gesture-handler 3.3,
react-native-svg (new), expo-splash-screen, Jest (jest-expo) + @testing-library/react-native.

**Spec:** `docs/design/one-remote-mockup.html` — sections Screen index (`#s-index`, the `INDEX` array),
Token changes for the app (`#s-changes`, the `CH` array, line ~1567), Copy changes for the app
(`#s-copy` plus the note under the token table), Motion (`#s-motion`, `MOT`/`EAS` arrays), Dark theme
(`#s-dark`), Components and states (`#s-comp`). CSS tokens: lines 13-88; component CSS: lines 194-543;
icon `<symbol>`s: lines 575-615. Background: `docs/superpowers/specs/2026-10-30-one-remote-design.md`.

## Global Constraints

- Bun only: `bun install`, `bun add`, `bunx`, `bun run`. Never npm, yarn or pnpm.
- Tests: `bunx jest --maxWorkers=2` (a path filter is fine while iterating; the full run before every
  commit that ends a task). Types: `bunx tsc --noEmit`. Lint: `bun run lint` (`--max-warnings=0`).
- The pre-commit hook runs prettier + eslint: no `console.log` (`console.warn`/`console.error` only),
  no `!` non-null assertions.
- Commits: Conventional Commits, author `Devansh Choubey <devanshc13@gmail.com>`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The hook rejects the `merge:` type: merge
  commits are `chore: merge <what> (<branch>)`, as in the existing history. Do not push.
- Privacy: local network only, no cloud. No new network code; nothing added here may reach the network
  (no remote fonts, images or analytics).
- The mock `docs/design/one-remote-mockup.html` is the single source of design truth. Never create
  another mock file. If an implementation forces a design change, the mock is edited **in place** —
  in Wave 0 by Task 0.4, in Wave 1 **not at all** (write the needed mock edit in the task report), in
  Wave 2 by the integration task, which applies every reported edit.
- Reduced motion and dark theme are part of every task, not a final pass: every new animation reads
  `useMotion()`; under `reduced` moves become fades (`lift` 0, no translate/scale), loops stop, a
  spinner or skeleton becomes a slow blink (1200 ms / 1600 ms opacity loop). Every task's tests render
  at least one of its screens/components with `scheme="dark"` and one with `reducedMotion`.
- Keep jest selectors and accessibility working: every existing `testID`, `accessibilityLabel` (all
  come from `t(...)`), `accessibilityRole` (`button`, `switch`, `togglebutton`, `header`, ...),
  `accessibilityState` (`selected`, `checked`, `expanded`, `busy`, `disabled`) and live region
  (`Txt live` → `accessibilityLiveRegion="polite"`) stays as it is unless this plan names the change.
  Icons are decorative (`accessible={false}`); the control around them carries the label.
- Colours, radii, shadows and fonts come from `src/theme` only (`tests/theme-centralized.test.ts`
  bans hex/rgba literals, numeric `radius:` and numeric `shadow*:` outside `src/theme`).
- Screens compose from `@/ui`. Raw React Native visuals stay lint-banned in `src/screens` and `app`.
  `react-native-svg`, and Reanimated's `default`/`Animated`/`createAnimatedComponent` exports, are
  imported only under `src/ui/**` (Task 0.1 adds the lint rule). Screens may use Reanimated hooks
  (`useSharedValue`, `useAnimatedStyle`, `withTiming`...) and pass the style to `AnimatedBox`.
- `react-native-svg` is added with `bunx expo install react-native-svg` (never `bun add`). It is a
  native module: a new native build is needed after it lands.
- Release build for the phone: `android/` is generated and git-ignored, so first
  `bunx expo prebuild -p android`, then in `android/`:
  `ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleRelease -q`; install with
  `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
- New copy goes in `src/i18n/en/*.ts`; all copy this plan needs is added in Task 0.4, exactly as
  written there. In Wave 1 a task edits only the i18n namespace files it owns (table below).
- Wave 1 parallel rules: each task works in its own worktree
  `.superpowers/worktrees/<id>` on branch `lane/mock-<id>`, cut from the Wave 0 tip of the
  integration branch `lane/app-mock`; it edits only the files in its "Files owned" row; it never edits
  `src/ui/index.ts`, `src/ui/primitives/index.ts`, `tests/ui/contracts.test.tsx`,
  `tests/screens/helpers.tsx`, `jest.config.js`, `eslint.config.js`, `package.json`, `bun.lock` or the
  mock; it never changes an exported interface from Wave 0 (it may add optional props only to files it
  owns). If a task needs something outside its files, it stops and reports instead.

## Review Focus

1. **Reduced motion switched on while a loop is running** (mic held, radar searching, Matter beam,
   skeleton): the loop stops at once and the element rests visible at full opacity, no stuck scale or
   half-faded state. Tests: 1G `micButton` reduced test, 1H radar reduced test, 1B skeleton test.
2. **A toast arrives while another shows, or the screen that raised it unmounts** (remove a device,
   sheet closes, Home appears): the newest toast replaces the old one, it survives the navigation
   because the provider is above the stack, and no timer fires after unmount. Tests: 0.3 toast
   contract, 1E "Device removed" test.
3. **Android hardware back with a sheet or the ⋮ menu open:** back closes the sheet or menu, not the
   screen underneath. Tests: 1C `Sheet` `onRequestClose` test, 1F menu-back test.
4. **Theme changed to Dark while a screen is open** (Settings → Dark, then back): animated colours
   (toggle track, segmented thumb, dial arc, chip fill) recolour at once; no light colour captured in
   a worklet or memo. Tests: 1A toggle/segmented rerender test, 1I dial rerender test.
5. **Large system font and long names** (font scale 1.3, a 40-character device or room name): 56 px
   buttons and 48 px chips grow instead of clipping, the bar title stays on one line with an ellipsis,
   card names wrap to two lines and the card switch stays visible. Tests: 1B `Screen` title
   `numberOfLines=1`, 1D `DeviceCard` name `numberOfLines=2`.

---

## Wave 0: shared foundation (one agent, sequential)

Branch: create `lane/app-mock` from `main` in `.superpowers/worktrees/app-mock`. Tasks 0.1-0.4 commit
there in order. Wave 1 starts from the tip after Task 0.4.

| Task | Files owned | Depends on | Merge order |
|---|---|---|---|
| 0.1 svg + Reanimated spike | `package.json`, `bun.lock`, `jest.config.js`, `tests/setup/reanimated.ts`, `eslint.config.js`, `app/dev/svg-spike.tsx`, `tests/ui/svgSpike.test.tsx` | main | commits on `lane/app-mock` 1st |
| 0.2 tokens + motion + Txt | `src/theme/*`, `src/ui/primitives/Txt.tsx`, `tests/theme/tokens.test.ts`, `tests/theme/motion.test.tsx` | 0.1 | 2nd |
| 0.3 icons + component contracts | `src/ui/**` (all new shared files below), `src/ui/index.ts`, `src/ui/primitives/{Touchable,Input,AnimatedBox,index}.tsx`, `src/screens/AppProviders.tsx`, `tests/screens/helpers.tsx`, `tests/ui/contracts.test.tsx` | 0.2 | 3rd |
| 0.4 copy + cross-task props + known mock edits | `src/i18n/en/*.ts`, `src/screens/tv/{KeyButton,DPad,MicButton,TvScreen}.tsx` (callsites only), `tests/i18n.test.ts`, `tests/screens/appliance/statusLine.test.ts`, the mock | 0.3 | 4th |

### Task 0.1: Prove react-native-svg + Reanimated `useAnimatedProps` on SDK 58

**Files:**
- Modify: `package.json`, `bun.lock` (via `bunx expo install react-native-svg`)
- Modify: `jest.config.js` (add `setupFiles: ['<rootDir>/tests/setup/reanimated.ts']`)
- Create: `tests/setup/reanimated.ts` (calls Reanimated 4's `setUpTests()` per its testing docs)
- Modify: `eslint.config.js` (add `'app/dev/svg-spike.tsx'` to `DEV_SPIKE_FILES` under a
  `// ui lane` comment; add the svg/Animated restriction below)
- Create: `app/dev/svg-spike.tsx`, `tests/ui/svgSpike.test.tsx`

**Interfaces:**
- Produces: `react-native-svg` installed; Reanimated works under Jest; lint rule: in `src/screens/**`
  and `app/**` (except `DEV_SPIKE_FILES`) importing `react-native-svg` is an error with the message
  `"Draw with @/ui (Icon and the src/ui components) instead."`, and importing `default`, `Animated`
  or `createAnimatedComponent` from `react-native-reanimated` is an error with the message
  `"Use AnimatedBox from @/ui/primitives; Reanimated hooks are fine."`.

- [ ] **Step 1: Install.** Run `bunx expo install react-native-svg`. Expected: `package.json` gains
  `react-native-svg` at the SDK 58 pinned version.
- [ ] **Step 2: Write the failing tests** in `tests/ui/svgSpike.test.tsx`:
  `it('renders an animated svg circle')` renders the spike's exported `SvgSpike` and expects
  `screen.getByTestId('svg-spike-arc')` to exist; plus three lint cases in the same file, using the
  `spawnSync` ESLint helper pattern from `tests/lint-rules.test.ts`:
  `expect(errorsFor("import Svg from 'react-native-svg';\nexport const X = Svg;\n", 'src/screens/x.tsx')).toContain('no-restricted-imports')`
  and the same for `"import Animated from 'react-native-reanimated';\nexport const X = Animated;\n"`;
  plus `expect(errorsFor("import { useSharedValue } from 'react-native-reanimated';\nexport const X = useSharedValue;\n", 'src/screens/x.tsx')).toEqual([])`.
- [ ] **Step 3: Run** `bunx jest --maxWorkers=2 tests/ui/svgSpike.test.tsx`. Expected: FAIL (no spike,
  no rule).
- [ ] **Step 4: Implement** `app/dev/svg-spike.tsx`: redirect to `/` unless `__DEV__` (same as
  `app/dev/tv-spike.tsx`); export `SvgSpike()` drawing a 132 px `Svg` with a background `Circle`
  (r 58, stroke `line`, width 8) and an `Animated.createAnimatedComponent(Circle)` with
  `testID="svg-spike-arc"`, `strokeDasharray={364.4}`, whose `strokeDashoffset` loops 0 → 364.4 over
  1500 ms via `useAnimatedProps` + `withRepeat(withTiming(...))`. Add the lint rule and setup file.
- [ ] **Step 5: Run** the test file, then `bunx tsc --noEmit` and `bun run lint`. Expected: PASS, clean.
- [ ] **Step 6: Device check (the gate for the whole plan).** `bunx expo prebuild -p android --clean`,
  then the release build command, install, open `oneremote:///dev/svg-spike` on a dev build (or
  `bun run android` dev client). Expected: the arc animates smoothly with no red box and no
  "Unimplemented component" warning. If it fails, stop and report: Wave 1 tasks 1H and 1I and the
  `Icon` set depend on it.
- [ ] **Step 7: Commit** `build(ui): add react-native-svg and prove animated svg on SDK 58`.

### Task 0.2: Tokens, motion hook, Txt variants

**Files:**
- Modify: `src/theme/tokens.ts`, `src/theme/ThemeProvider.tsx`, `src/theme/index.ts`
- Create: `src/theme/motion.ts`
- Modify: `src/ui/primitives/Txt.tsx`
- Test: `tests/theme/tokens.test.ts`, Create `tests/theme/motion.test.tsx`

**Interfaces:**
- Produces (exact values, light / dark; the soft and pressed colours are the mock's `color-mix`
  values precomputed over `surface`):

  | `Tokens.color` key | light | dark |
  |---|---|---|
  | `okInk` | `#17744a` | `#4cc88c` |
  | `dangerInk` | `#c4262c` | `#ff8b8f` |
  | `scrim` | `rgba(13, 15, 18, 0.45)` | `rgba(0, 0, 0, 0.6)` |
  | `accentSoft` (12 %) | `#e6edfe` | `#252e41` |
  | `okSoft` (14 %) | `#e0f1e9` | `#1c322f` |
  | `dangerSoft` (12 %) | `#fce9ea` | `#34252c` |
  | `warmSoft` (16 %) | `#fdeadf` | `#3e2e2a` |
  | `dangerLine` (danger 35 % over dangerSoft) | `#f4b1b3` | `#723138` |
  | `accentPressed` (accent + 14 % black) | `#285ed4` | `#5b81db` |
  | `surface2Pressed` (surface2 + 8 % ink) | `#dfe1e5` | `#333842` |
  | `toastErrorBg` | `#c4262c` | `#5a1d20` |
  | `toastErrorInk` | `#ffffff` | `#ffd9da` |
  | `toastOkIcon` | `#4cc88c` | `#4cc88c` |
  | `onFill` (white on ok/danger discs) | `#ffffff` | `#ffffff` |
  | `cameraBg` | `#14181e` | `#14181e` |
  | `cameraInk` | `#ffffff` | `#ffffff` |
  | `cameraBeam` | `#7fb0ff` | `#7fb0ff` |
  | `cameraLock` | `#4cc88c` | `#4cc88c` |
  | `cameraBadge` | `#17744a` | `#17744a` |

  - `radius`: add `sheet: 28`, `tile: 14`, `art: 32`.
  - `shadow`: add `pop` = light `{ shadowColor '#15181d', offset 0/10, opacity 0.18, radius 28,
    elevation 8 }`, dark `{ '#000000', 0/10, 0.55, 28, 8 }`; `sheet` = light `{ '#15181d', 0/-10,
    0.22, 40, 16 }`, dark `{ '#000000', 0/-10, 0.6, 40, 16 }`. (The mock's second pop layer
    `0 2 6 .08` and dark `0 0 0 1px line` ring are drawn as a 1 px `line` border by the component.)
  - `size`: add `display: 76`, `displaySup: 28`, `label: 15`.
  - `lineHeight` (new): `{ title: 35, heading: 25, body: 22, label: 20, caption: 18, display: 76 }`
    (mock 1.15 / 1.2 / 1.4 / 1.3 / 1.35 / 1, rounded px).
  - `tracking` (new): `{ title: -0.45, display: -2.28 }` (-.015em × 30, -.03em × 76).
  - `touch`: `{ min: 48, key: 56 }` (type `{ min: 48; key: 56 }`).
  - `motion` (new, theme-independent, in `base`):
    `duration: { instant: 90, fast: 160, base: 260, slow: 380, ambient: 1500, spinner: 900 }`,
    `easing: { standard: [0.2, 0, 0, 1], enter: [0.05, 0.7, 0.1, 1], exit: [0.3, 0, 0.8, 0.15],
    spring: [0.34, 1.45, 0.64, 1] }` (tuples), `stagger: 45`, `lift: 14`.
- Produces in `src/theme/motion.ts` (re-exported from `@/theme`):
  ```ts
  export type DurationName = keyof Tokens['motion']['duration'];
  export type EaseName = keyof Tokens['motion']['easing'];
  export interface Motion {
    reduced: boolean;
    duration: Tokens['motion']['duration'];
    ease: Record<EaseName, EasingFunctionFactory>; // Easing.bezier(...) from the tuples
    lift: number;      // 14, or 0 when reduced
    stagger: number;   // 45, or 0 when reduced
    timing(d: DurationName, e?: EaseName): { duration: number; easing: EasingFunctionFactory };
  }
  export function useMotion(): Motion;
  ```
  `ThemeProviderProps` gains `reducedMotion?: boolean` (forces it, for tests); otherwise `reduced`
  comes from Reanimated's `useReducedMotion()`.
- Produces in `Txt`: `variant` adds `'display' | 'label'` (display: 76/700, tracking -2.28, line 76,
  `fontVariant: ['tabular-nums']`; label: 15/700, line 20); every variant gets its `lineHeight`;
  title gets `letterSpacing: -0.45`; new prop `tabular?: boolean`.

- [ ] **Step 1: Write failing tests.** In `tokens.test.ts`: `it('has the new mock tokens')` asserting
  each table value above for both themes, `radius.sheet === 28`, `touch.key === 56`,
  `motion.duration.slow === 380`, `motion.easing.enter` toEqual `[0.05, 0.7, 0.1, 1]`; extend the AA
  pairs with `['okInk','surface']`, `['okInk','bg']`, `['dangerInk','surface']`, `['dangerInk','bg']`,
  `['okInk','okSoft']`, `['dangerInk','dangerSoft']`, `['ink','warmSoft']`, `['toastErrorInk','toastErrorBg']`
  (all ≥ 4.5; the values above give ≥ 4.9). The existing "same keys" test covers dark parity. In
  `motion.test.tsx`: under `<ThemeProvider reducedMotion>` a probe reading `useMotion()` gets
  `reduced true, lift 0, stagger 0`; without it `lift 14`, `timing('base').duration === 260`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/theme`. Expected: FAIL.
- [ ] **Step 3: Implement** the tokens, `useMotion` (context set by `ThemeProvider`), Txt changes.
- [ ] **Step 4: Run** the full suite, `bunx tsc --noEmit`, `bun run lint`. Expected: PASS (existing
  screens still compile; `touch.min` unchanged).
- [ ] **Step 5: Commit** `feat(theme): add the mock's tokens, motion tokens and useMotion`.

### Task 0.3: Icon set and every shared component's contract

Plain bodies only: token-styled, correct a11y, correct sizes from the mock, **no animation**
(Wave 1 adds it). Each new component body stays short; this task is about interfaces.

**Files:**
- Create in `src/ui/`: `Icon.tsx`, `iconPaths.ts`, `IconButton.tsx`, `Spinner.tsx`, `StatusDot.tsx`,
  `Badge.tsx`, `Tile.tsx`, `Banner.tsx`, `ErrorLine.tsx`, `Field.tsx`, `SegmentedControl.tsx`,
  `OptionCard.tsx`, `Group.tsx` (exports `Group`, `ListItem`), `Skeleton.tsx` (exports `Skeleton`,
  `SkelCard`), `ProgressBar.tsx`, `ResultDisc.tsx`, `Rise.tsx`, `Mark.tsx`, `Toast.tsx` (exports
  `ToastProvider`, `useToast`), `Sheet.tsx`, `Menu.tsx`
- Modify in `src/ui/`: `Button.tsx`, `Chip.tsx`, `Card.tsx`, `EmptyState.tsx`, `Screen.tsx`,
  `Toggle.tsx` (props only, see below), `index.ts`
- Modify: `src/ui/primitives/Touchable.tsx`, `src/ui/primitives/Input.tsx`; Create
  `src/ui/primitives/AnimatedBox.tsx`; Modify `src/ui/primitives/index.ts`
- Modify: `src/screens/AppProviders.tsx` (wrap children in `ToastProvider` inside `ThemeFromPrefs`)
- Modify: `tests/screens/helpers.tsx`; Create `tests/ui/contracts.test.tsx`

**Interfaces (Produces — Wave 1 codes against exactly these; all exported from `@/ui`):**
```ts
// Icon.tsx — paths copied verbatim from the mock <symbol>s (lines 575-615), viewBox 0 0 24 24,
// stroke currentColor 2, round caps/joins; circles with fill="currentColor" stay filled.
export type IconName = 'back'|'chev'|'up'|'down'|'left'|'right'|'close'|'plus'|'minus'|'check'|'gear'
  |'power'|'more'|'keyboard'|'mic'|'home'|'tv'|'ac'|'fan'|'wifi'|'wifioff'|'alert'|'info'|'camera'
  |'cameraoff'|'clip'|'swing'|'moon'|'bolt'|'bulb'|'snow'|'drop'|'wind'|'auto'|'trash'|'input'|'lock'
  |'room'|'ir'|'play'|'refresh';
export const ICON_NAMES: readonly IconName[];
export interface IconProps { name: IconName; size?: number /*24*/; color?: ColorToken /*'ink'*/;
  strokeWidth?: number /*2*/; testID?: string }

// primitives/Touchable.tsx — adds (existing props unchanged):
  pressScale?: number;        // scale while pressed: 0.97 default, 1 = none
  pressedBg?: ColorToken;     // background tint while pressed (wrapper draws it)
  testID?: string;
// opacity: disabled 0.42, dimmed 0.6 (mock .card.off), pressed: no opacity change any more

// primitives/AnimatedBox.tsx
export interface AnimatedBoxProps extends BoxProps { animatedStyle?: AnimatedStyle<ViewStyle>;
  pointerEvents?: 'auto'|'none'|'box-none' }

// primitives/Input.tsx — adds: invalid?: boolean; keyboardType?: 'default'|'numeric'|'decimal-pad';
//   editable?: boolean; autoFocus?: boolean; testID?: string. Height touch.key (56), radius md,
//   1 px line border; focused 2 px accent; invalid 2 px danger.

export interface IconButtonProps { icon: IconName; label: string; onPress: () => void;
  tone?: 'ink'|'power' /*power = dangerInk*/; flat?: boolean; expanded?: boolean; disabled?: boolean;
  testID?: string }                                        // 48 round, surface + line ring

export interface ButtonProps { label: string; onPress: () => void;
  variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'key'|'small' /*56 full width | 48 auto*/;
  icon?: IconName; disabled?: boolean; loading?: boolean; selected?: boolean;
  accessibilityLabel?: string }

export interface ChipProps { label: string; state: ChipState; onToggle?: () => void;
  disabled?: boolean; icon?: IconName }                    // min 48, px 16, label 15 bold, icon 18

export interface ToggleProps { label: string; value: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; hideLabel?: boolean }                // unchanged; role switch, checked

export interface SegmentOption<V extends string> { value: V; label: string; icon?: IconName }
export interface SegmentedControlProps<V extends string> { label: string;
  options: readonly SegmentOption<V>[]; value: V; onChange: (v: V) => void; disabled?: boolean }
// each segment: Touchable role 'togglebutton', accessibilityLabel = option.label, selected

export interface FieldProps extends InputProps { label: string; error?: string | null;
  helper?: string; shakeKey?: number /*bump to shake once*/ }
export interface ErrorLineProps { text: string }          // alert icon 18 + dangerInk 14, live

export interface CardProps { children: ReactNode; testID?: string; off?: boolean /*0.6*/;
  index?: number /*rise stagger*/; row?: boolean /*row layout, min-height 76*/ }
export interface TileProps { icon: IconName; size?: 44|56; tone?: 'ink'|'accent' }
export interface OptionCardProps { title: string; subtitle?: string; icon: IconName;
  onPress: () => void; badge?: BadgeProps; disabled?: boolean; index?: number;
  accessibilityLabel?: string; testID?: string }          // 88 high, tile 56, 18 px name, chevron

export interface EmptyStateProps { title: string; body: string; action?: ReactNode;
  art?: IconName | 'mark'; tone?: 'accent'|'ink2'|'warm'|'danger'; fill?: boolean /*fill height*/ }
export interface BannerProps { text: string; tone?: 'info'|'ok'|'error' /*warmSoft|okSoft|dangerSoft*/;
  icon?: IconName; testID?: string }
export interface BadgeProps { label: string; tone?: 'neutral'|'ok'|'accent' }
export interface StatusDotProps { tone: 'ok'|'warn'|'err'; live?: boolean /*blink 1.4 s*/ }
export interface SpinnerProps { size?: 'sm'|'lg' /*20|36*/; color?: ColorToken }
export interface SkeletonProps { width?: number | `${number}%`; height: number; radius?: RadiusToken }
export function SkelCard(): ReactElement;                 // tile 44 + 2 bars + switch pill
export interface ProgressBarProps { value: number /*0..1*/; label: string } // role progressbar
export interface ResultDiscProps { kind: 'ok'|'bad'; label: string }       // 96 disc, check / alert
export interface RiseProps { index?: number; children: ReactNode }         // entering rise 14 px
export interface MarkProps { size?: number /*112*/; animate?: boolean; onDone?: () => void }

export interface GroupProps { children: ReactNode; label?: string }
export interface ListItemProps { title: string; subtitle?: string; onPress?: () => void;
  trailing?: 'chevron'|'expand'|ReactNode; badge?: BadgeProps; expanded?: boolean;
  disabled?: boolean; accessibilityLabel?: string; testID?: string }       // 56 high, 1 px dividers

export interface ScreenProps { /* existing */ title?; children; scroll?; onBack?; footer?; bare?;
  subtitle?: ReactNode;   // caption row under a bar title (status text + StatusDot)
  actions?: ReactNode }   // IconButtons at the right of the bar / big title
// with onBack: bar = IconButton(back, t('common.back'), testID 'screen-back') + heading 21 title,
// numberOfLines 1; without onBack: 30 px title (Home style)

export type ToastKind = 'info'|'ok'|'error';
export interface ToastOptions { kind?: ToastKind; action?: { label: string; onPress: () => void };
  durationMs?: number /*4000; 6000 with an action*/ }
export interface ToastApi { show(message: string, opts?: ToastOptions): void; hide(): void }
export function ToastProvider(props: { children: ReactNode }): ReactElement;
export function useToast(): ToastApi;    // throws outside the provider
// one toast at a time, newest replaces; testID 'toast'; error: role alert, else live polite

export interface SheetProps { open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode; testID?: string }
// RN Modal transparent, animationType none, onRequestClose → onClose (Android back);
// scrim Touchable labelled t('common.close'); grabber 40x5; top radius sheet; bg 'bg';
// header = heading title + flat IconButton close; max height 90 %

export interface MenuItem { key: string; label: string; onPress: () => void; current?: boolean;
  dividerBefore?: boolean }
export interface MenuProps { open: boolean; onClose: () => void; items: readonly MenuItem[];
  testID?: string }  // anchored top-right under the bar, min width 220, rows 48, outside tap closes
```

- [ ] **Step 1: Write failing tests** in `tests/ui/contracts.test.tsx` (these are invariants Wave 1
  must keep green):
  - `ICON_NAMES` has 41 entries and every name renders an `Icon` without throwing.
  - `IconButton` → `getByLabelText(label)` has role `button`; `expanded` → `accessibilityState.expanded`.
  - `Button variant="danger"` renders; `loading` → `accessibilityState.busy === true` and no press.
  - `Chip` with `onToggle` has role `togglebutton` and `selected`.
  - `Toggle` has role `switch` and `checked` mirrors `value`; pressing calls `onChange(!value)`.
  - `SegmentedControl` options each have role `togglebutton`; only the `value` one is `selected`;
    pressing another calls `onChange` with its value.
  - `Field` with `error` shows the error text with `accessibilityLiveRegion` set; input has the label.
  - `ProgressBar value={0.5}` has role `progressbar` and `accessibilityValue` `{min:0,max:100,now:50}`.
  - `Toast`: `show('Saved', {kind:'ok'})` shows `Saved`; a second `show('Moved up')` replaces it;
    after `jest.advanceTimersByTime(4000)` it is gone; unmounting the provider with a toast pending
    logs no error; `useToast()` outside the provider throws.
  - `Sheet open` shows `title`; pressing `t('common.close')` calls `onClose`; the Modal's
    `onRequestClose` prop calls `onClose`; `open={false}` renders nothing.
  - `Menu` renders items in order, `current` item has `accessibilityState.selected`, pressing the
    outside area (label `t('common.close')`) calls `onClose`.
  - `Screen onBack` still has `testID 'screen-back'` with label `t('common.back')`.
  - Dark: `Banner tone="error"` under `scheme="dark"` has background `darkTokens.color.dangerSoft`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/ui/contracts.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the files with plain bodies; update `src/ui/index.ts` and
  `src/ui/primitives/index.ts` to export every name above. `tests/screens/helpers.tsx`:
  `renderWith(s, ui, opts?: { scheme?: 'light'|'dark'; reducedMotion?: boolean })` wraps in
  `ThemeProvider` (with both) + `ServicesProvider` + `ToastProvider`.
- [ ] **Step 4: Run** the full suite, `bunx tsc --noEmit`, `bun run lint`. Expected: PASS; existing
  screen tests unchanged (Touchable no longer dims on press; no test reads pressed opacity).
- [ ] **Step 5: Commit** `feat(ui): add the icon set and the mock's shared component contracts`.

### Task 0.4: All new copy, cross-task props, known mock edits

**Files:**
- Modify: `src/i18n/en/common.ts`, `addTv.ts`, `device.ts`, `ac.ts`, `fan.ts`, `tv.ts`
- Modify: `src/screens/tv/KeyButton.tsx`, `src/screens/tv/DPad.tsx`, `src/screens/tv/MicButton.tsx`,
  `src/screens/tv/TvScreen.tsx` (callsites only)
- Modify: `tests/i18n.test.ts`, `tests/screens/appliance/statusLine.test.ts:31`
- Modify: `docs/design/one-remote-mockup.html`

**Interfaces:**
- Produces copy (exact strings):
  - `common.tagline`: `'Nothing leaves your home network.'`
  - `common.openSettings`: `'Open Settings'`
  - `common.saved`: `'Saved'`
  - `addTv.pairedFirst`: `'Paired'` (`addTv.paired` stays `'Paired again'`)
  - `addTv.localNetworkOff`: `'Local Network is off for One Remote. Turn it on in Settings › Privacy & Security › Local Network.'`
  - `device.removed`: `'Device removed'`
  - `ac.offHint`: `'Tap power to turn on'`
  - `tv.inputNow`: `'Now'`
  - `tv.voiceSent`: `'Sent to the TV'`
  - Plain words, icons are drawn: `ac['mode.cool'] 'Cool'`, `['mode.dry'] 'Dry'`, `['mode.fan'] 'Fan'`,
    `['mode.auto'] 'Auto'`, `swing 'Swing'`, `sleep 'Sleep'`,
    `['status.connected'] "Connected · how it's connected"`; `fan.boost 'Boost'`, `fan.sleep 'Sleep'`,
    `fan.light 'Light'`, `fan['status.connected'] "Connected · how it's connected"`.
  - "Needs a phone with IR" as a toast reuses `home.needsIr` / `ac.error.needsIr` / `fan.error.needsIr`.
- Produces props: `KeyButtonProps` = `{ label: string; icon: IconName; onPress: () => void;
  size?: 64 | 84 | 56 | 100; tone?: 'surface' | 'accent'; text?: string }` (replaces `glyph`, `round`, `primary`,
  `circle`); `MicButtonProps` gains `onSent?: () => void` (called when a voice/dictation message has
  left the phone). Callsites updated: `TvScreen.tsx` Back `icon="back"` size 64, Home `icon="home"`
  size 84; `DPad.tsx` `up`/`down`/`left`/`right` size 84, OK keeps its text label with
  `tone="accent"` (KeyButton keeps an optional `text?: string` for that one key). Bodies use `Icon`.
- Mock edits, in place: `.tv-panel .art` radius 30px → `var(--radius-art)` (32), `.fan-hero .art`
  36px → 32, `.mark` 34px → 32, `.empty .art` 32px → `var(--radius-art)`; add `--radius-art: 32px;
  --radius-tile: 14px;` to the radius tokens and use `--radius-tile` in `.tile`, `.otp i`, `.opn`;
  `.badge.acc` colour `var(--color-accent)` → `var(--color-ink)` (accent on accentSoft is 3.9:1, under
  AA for 12 px text); add the new keys to the "Copy changes" list and a `CH` row for `color.*Pressed`,
  `toast*`, `camera*`, `radius.tile/art`, `size.label`, `lineHeight`.

- [ ] **Step 1: Failing tests.** `tests/i18n.test.ts`: `it('has the mock copy')` asserting each exact
  string above, and `it('has no emoji or glyph prefixes in AC and fan labels')`:
  for every value in `ac` and `fan`, `expect(v).not.toMatch(/[←-⯿\u{1F300}-\u{1FAFF}●]/u)`.
  Update `statusLine.test.ts:31` to `"Connected · how it's connected"`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/i18n.test.ts tests/screens/appliance`. Expected: FAIL.
- [ ] **Step 3: Implement** copy, the `KeyButton`/`MicButton` props and callsites, the mock edits.
- [ ] **Step 4: Run** full suite, `bunx tsc --noEmit`, `bun run lint`. Open the mock in a browser
  (`file://`) and check the Components and Dark theme sections still render. Expected: PASS.
- [ ] **Step 5: Commit** `feat(i18n): add the mock's copy and drop glyphs from AC and fan labels`
  (mock change in a second commit: `docs(design): unify art radii and badge contrast in the mock`).

---

## Wave 1: ten parallel tasks

Every task: `git worktree add .superpowers/worktrees/mock-<id> -b lane/mock-<id> lane/app-mock`, then
`bun install` there. Tests use `renderWith(..., { scheme, reducedMotion })` from `tests/screens/helpers.tsx`.

| Task | Files owned (only these) | i18n owned | Depends on | Merge order into `lane/app-mock` |
|---|---|---|---|---|
| 1A Controls in motion | `src/ui/primitives/{Touchable,Input}.tsx`, `src/ui/{Button,Chip,IconButton,Toggle,SegmentedControl,Field,ErrorLine}.tsx`, `tests/ui/kit.test.tsx`, `tests/ui/primitives.test.tsx`, `tests/ui/controls.test.tsx` | none | Wave 0 | 1 |
| 1B Surfaces in motion | `src/ui/{Card,Tile,OptionCard,EmptyState,Banner,Badge,StatusDot,Spinner,Skeleton,ProgressBar,ResultDisc,Rise,Group,Screen,Icon,iconPaths}.tsx/.ts`, `src/ui/primitives/AnimatedBox.tsx`, `tests/ui/surfaces.test.tsx` | none | Wave 0 | 2 |
| 1C Overlays, navigation, launch | `src/ui/{Toast,Sheet,Menu,Mark}.tsx`, `app/_layout.tsx`, `src/screens/navigation.ts` (new), `src/screens/launch/LaunchOverlay.tsx` (new), `app.json`, `assets/images/splash-icon.png` (only if replaced), `tests/ui/overlays.test.tsx`, `tests/screens/launch.test.tsx` | none | Wave 0 | 3 |
| 1D Home, kind picker, name and room | `src/screens/home/*`, `src/screens/add/{KindPicker,NameRoomStep,AddPlaceholder}.tsx`, `app/index.tsx`, `app/add/index.tsx`, `tests/screens/{home,nameRoom,summary}.test.tsx/.ts`, `tests/screens/kindPicker.test.tsx` (new) | `home.ts`, `add.ts` | Wave 0 | 4 |
| 1E Device settings and Settings | `src/screens/device/*`, `src/screens/settings/*`, `src/screens/tv/TvLinkActions.tsx`, `src/screens/appliance/IrBackupAction.tsx`, `app/device-sheet/[id].tsx`, `app/settings.tsx`, `app/add/ir-backup.tsx`, `tests/screens/{deviceSheet,settings}.test.tsx`, `tests/screens/tv/tvLinkActions.test.tsx`, `tests/screens/appliance/irBackup.test.tsx`, `tests/app/deviceRoute.test.tsx` | `device.ts`, `settings.ts`, `irBackup.ts` | Wave 0 | 5 |
| 1F TV shell | `src/screens/tv/{TvScreen,TvBar,BarButton,TvMenu,TvOffPanel,UnreachablePanel,InputSheet,KeyboardSheet,tvMode}.tsx/.ts`, `src/core/model.ts` (`TvState` only), `app/device/[id].tsx`, `tests/screens/tv/{tvScreen.test.tsx,tvMode.test.ts}` | `tv.ts` | Wave 0 | 6 |
| 1G TV controls | `src/screens/tv/{TouchPad,DPad,KeyButton,MicButton}.tsx`, `src/ui/tv/*` (new), `tests/screens/tv/micButton.test.tsx`, `tests/screens/tv/pads.test.tsx` (new) | none | Wave 0 | 7 |
| 1H Add a TV | `src/screens/add/tv/*`, `src/ui/addtv/*` (new), `app/add/tv.tsx`, `tests/screens/add/addTv.test.tsx` | `addTv.ts` | Wave 0 | 8 |
| 1I AC and fan | `src/screens/appliance/{AcScreen,FanScreen,statusLine,useDeviceView,acModel,fanModel,sendErrors}.ts(x)`, `src/ui/appliance/*` (new), `tests/screens/appliance/{acScreen,fanScreen,acModel,statusLine}.test.ts(x)`, `tests/screens/appliance/applianceHelpers.tsx` | `ac.ts`, `fan.ts` | Wave 0 | 9 |
| 1J Add an AC or fan, IR, Matter | `src/screens/add/appliance/*`, `src/ui/add/*` (new), `app/add/{ac,fan}.tsx`, `tests/screens/add/{addAppliance,matterScan,matterStep,flow,irTest}.test.ts(x)` | `addAppliance.ts`, `matter.ts`, `ir.ts` | Wave 0 | 10 |

Merge order rationale: shared UI first (1A-1C), so each screen branch merged afterwards runs its
tests against the final components; screen branches are file-disjoint, so their order only matters
for bisecting. After **each** merge run the full suite before the next.

### Task 1A: Controls in motion

**Files:** as owned above.

**Interfaces:**
- Consumes: `useMotion()`, tokens (Task 0.2); contracts (Task 0.3). Produces nothing new.

Mock values: press scale `Button .97`, `IconButton .92` (+ `surface2` bg), `Chip .95`, all over
`instant` 90 ms ease standard, released with `spring`. Button primary pressed bg `accentPressed`,
secondary `surface2Pressed`, ghost `accentSoft`; danger = `dangerSoft` bg, `dangerInk` text, 1 px
`dangerLine` border; disabled opacity .42 (IconButton .4); loading shows `Spinner sm`. Chip bg/colour
fade `fast` 160. Toggle: custom 52x32 track (`ink2` off, `accent` on, `fast` colour), 26 thumb
(`surface`), thumb slides 20 px with `base` 260 + spring, widens to 32 while pressed (`instant`).
SegmentedControl: track `surface2` + line border, padding 4, gap 2; thumb `surface` + `shadow.card`
slides `base` 260 standard. Input focus ring 2 px `accent`, invalid 2 px `danger`, `fast`. Field
label caption bold `ink2` 6 px above; `shakeKey` change → shake 260 ms (-6, 5, -3 px). Reduced: no
scale, no slide (thumbs jump, colours still fade), no shake.

- [ ] **Step 1: Failing tests** (`tests/ui/controls.test.tsx`): `Button variant="danger"` style has
  bg `lightTokens.color.dangerSoft`, text `dangerInk`, minHeight 56; `size="small"` minHeight 48;
  `Chip` minHeight 48; `Toggle` thumb `testID 'toggle-thumb'` exists and the Touchable keeps role
  `switch`; `SegmentedControl` thumb `testID 'segment-thumb'`; **Review Focus 4:** render `Toggle
  value` in light, rerender the same tree under `scheme="dark"`, expect the track (`testID
  'toggle-track'`) bg `darkTokens.color.accent`; same for the segmented thumb (`surface`). Under
  `reducedMotion`, pressing a Button leaves its transform scale at 1.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/ui`. Expected: FAIL.
- [ ] **Step 3: Implement** with Reanimated shared values via `AnimatedBox`/`Animated` inside
  `src/ui` only. `Toggle` drops the RN `Switch`.
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS incl. `tests/ui/contracts.test.tsx`.
- [ ] **Step 5: Commit** `feat(ui): animate buttons, chips, toggle, segmented control and fields`.

### Task 1B: Surfaces in motion

**Interfaces:** Consumes Wave 0. Produces nothing new.

Mock values: Card bg `surface`, radius md, padding 16, gap 12, 1 px `line` border + `shadow.card`,
`row` min-height 76, `off` opacity .6. `Rise`: from opacity 0 and translateY `lift` (14) over `base`
260 `enter`, delay `index × stagger` (45 ms); reduced = fade only. Tile 44 (radius tile 14) or 56
(radius md), bg `surface2`, icon 24/30, tone accent colours the icon. OptionCard min 88, padding
16/20, gap 16, name 18 bold, trailing `chev` 22 `ink2`. EmptyState art 104 (radius art), `surface`
+ line + card shadow, icon 48 stroke 1.7 coloured by `tone`, body max width 300, `fill` = flex 1
centred; `art="mark"` renders `Mark size={96} animate={false}`. Banner radius md, padding 12/16, gap
12, 14 px text, icon 20 `ink`. Badge 12 bold, padding 3/10, pill: neutral `surface2`/`ink2` + line,
ok `okSoft`/`okInk`, accent `accentSoft`/`ink`. StatusDot 8 px `ok`/`warm`/`danger`, `live` blink
opacity 1 → .35 over 1400 ms loop (reduced: static). Spinner ring 20 (2.5 px) / 36 (3.5 px), open
quarter, rotate 900 ms linear loop (reduced: blink 1200 ms). Skeleton `surface2`, radius sm, a
translucent band sweeps across every 1500 ms (no gradient library; reduced: blink 1600 ms). ProgressBar
6 high, `line` track, `accent` fill, width animates `base`. ResultDisc 96, `okSoft` + check
(`okInk`, 52, stroke 3.2, draws over 420 ms after 140 ms) or `dangerSoft` + alert (`dangerInk`, 44),
pops in over `slow` with spring (reduced: fade). Screen bar: 48 min height, back `IconButton`,
title heading 21 bold `numberOfLines={1}`, `subtitle` caption row (gap 6), `actions` at the right,
padding 16 (`space(4)`), scroll gutter 16; non-bar title 30 with tracking.

- [ ] **Step 1: Failing tests** (`tests/ui/surfaces.test.tsx`): Card `off` opacity 0.6; `Badge
  tone="ok"` bg `okSoft`, text `okInk`; `EmptyState art="alert"` shows the art tile `testID
  'empty-art'`; `Skeleton` under `reducedMotion` renders no `testID 'skeleton-band'`; `StatusDot
  live` under `reducedMotion` has opacity 1; `Screen onBack title={longName}` title `numberOfLines`
  is 1 (**Review Focus 5**); `ResultDisc kind="bad"` under `scheme="dark"` bg `darkTokens.color.dangerSoft`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.** Icon and iconPaths only change if a path renders wrong on device.
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): restyle cards, banners, skeletons and the screen bar to the mock`.

### Task 1C: Overlays, navigation, launch

**Interfaces:**
- Consumes Wave 0 (`Toast`, `Sheet`, `Menu`, `Mark` contracts, `common.tagline`).
- Produces `src/screens/navigation.ts`:
  `export function stackOptions(theme: Tokens, motion: Motion): NativeStackNavigationOptions` →
  `{ headerShown: false, animation: motion.reduced ? 'fade' : 'slide_from_right',
  animationDuration: motion.reduced ? 260 : 380, contentStyle: { backgroundColor: theme.color.bg } }`
  (`animationDuration` is Android-only; iOS keeps the system push). And
  `export const SHEET_ROUTE_OPTIONS = { presentation: 'transparentModal', animation: 'none' } as const`
  applied in `app/_layout.tsx` to `device-sheet/[id]` (the `Sheet` animates itself).
- Produces `LaunchOverlay(props: { ready: boolean })`: full-screen `bg`, `Mark animate`, title
  `common.appName` (30), caption `common.tagline` at the bottom; unmounts after `ready` **and** the
  mark has drawn (`onDone`, ~960 ms; at once when reduced), with a `fast` fade out.

Mock values: Toast bottom 30 (+ safe area), left/right 16, min 52, radius md, `shadow.pop`, padding
8/8/8/16, gap 12, 15/600; info bg `ink` text `bg`; ok same + `check` icon `toastOkIcon`; error bg
`toastErrorBg` text `toastErrorInk` + `alert` icon; action = underlined 48 high text button; in:
`base` 260 `enter` from `lift` below and scale .98; out: `fast` 160 `exit` to half lift; dark adds a
1 px `line` border. Sheet: scrim `scrim` fades `base`; panel slides from 100 % in `slow` 380 `enter`,
out `base` 260 `exit`; reduced: both fade. Menu: `surface`, radius md, `shadow.pop` + line border,
padding 6, min width 220, rows 48 radius sm, divider 1 px `line` margin 4/8, `current` row `ink2`;
in `base` `enter` scale .9 → 1 from the top-right + half-lift drop, out `fast` `exit` to scale .96.
Mark: 112 square radius art, `accent` bg, glyph `accentInk` stroke 4: scale .7 → 1 over `slow`
spring, ring path `M20 15.5a22 22 0 1024 0` draws (dasharray 126) over 700 ms after 260 ms, stem
`M32 6v22`. Native splash (`app.json` `expo-splash-screen`): `backgroundColor '#eef0f3'`, `dark:
{ backgroundColor '#0d0f12' }`; `app.json` is outside `src/`, so the hex literals are allowed there.
Call `SplashScreen.preventAutoHideAsync()` at module scope in `app/_layout.tsx` and `hideAsync()`
when `LaunchOverlay` mounts.

- [ ] **Step 1: Failing tests.** `tests/ui/overlays.test.tsx`: toast `kind:'error'` under
  `scheme="dark"` bg `#5a1d20` (read via `darkTokens.color.toastErrorBg`); toast with action shows the
  label and calls it; **Review Focus 3:** `Sheet`'s Modal `onRequestClose()` → `onClose` once;
  `Menu` under `reducedMotion` renders items with no transform. `tests/screens/launch.test.tsx`:
  `stackOptions(lightTokens, reducedMotion)` → `animation 'fade'`; full → `'slide_from_right'`, 380;
  `LaunchOverlay ready={false}` shows `common.tagline`; with `reducedMotion` and `ready` it is gone
  after `jest.advanceTimersByTime(160)`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/ui/overlays.test.tsx tests/screens/launch.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `app/_layout.tsx` renders an inner `RootStack` (inside `AppProviders`,
  so it can read the theme) with `stackOptions` and the sheet route options, plus `LaunchOverlay
  ready={useHomeData().loaded}` (`src/screens/shared/useHomeData.ts`, read only).
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): animate toasts, sheets and menus; add the launch screen`.

### Task 1D: Home, kind picker, name and room

**Interfaces:** Consumes `Screen{actions}`, `IconButton`, `Card{index,off,row}`, `Tile`, `Toggle`,
`EmptyState{art,fill}`, `Banner`, `SkelCard`, `Skeleton`, `OptionCard`, `Field`, `ErrorLine`, `Chip`,
`useToast`. Produces nothing new.

Mock: header "Home" 30 + caption count; actions **gear then plus** (`IconButton gear
t('home.settings')`, `plus t('home.add')`). Loading (`!home.loaded`): title bar placeholder, gear and
plus disabled, 3 `SkelCard`, a room-label `Skeleton` bar, 2 `SkelCard`; container
`accessibilityState.busy`. Room label = caption bold `ink2` 13 (was heading 21). `DeviceCard`: `Card
row index={n}` + `Tile` (`tv`/`ac`/`fan`; accent tone when on) + name bold `numberOfLines={2}` +
summary caption + `Toggle hideLabel`; card press = `Touchable pressScale .985 pressedBg surface2`;
`needsIr` → `off`, toggle disabled, tap shows `toast.show(t('home.needsIr'))`. Empty: `EmptyState
art="mark" fill` with `home.welcomeTitle` (30), `welcomeBody`, button `home.addFirst` pinned in the
`footer`; only the gear action. Corrupt: `EmptyState art="alert" tone="danger"`. No IR: `Banner
icon="ir"` with `home.noIrBanner`. KindPicker: `OptionCard` per kind (`tv`, `ac`, `fan` icons) with
`index`, `Banner icon="ir"` when no IR. NameRoomStep: `Field` for the name, chips +
`add.newRoom`, new-room `Field` + `Button size="small"` inside `Rise`, `ErrorLine` on save failure.

- [ ] **Step 1: Failing tests** (`home.test.tsx`, `kindPicker.test.tsx`, `nameRoom.test.tsx`): before
  the store resolves, `getAllByTestId('skel-card')` has length 5 and gear is disabled; gear label
  precedes plus in the tree; a needs-IR card press shows `t('home.needsIr')` in `testID 'toast'`;
  **Review Focus 5:** a 40-character name's `Txt` has `numberOfLines` 2 and the card switch is still
  rendered; empty Home shows `home.addFirst` and no plus button; dark render of Home: card bg
  `darkTokens.color.surface`; reduced: cards render with no translate.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/home.test.tsx tests/screens/kindPicker.test.tsx tests/screens/nameRoom.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): match Home, the kind picker and name and room to the mock`.

### Task 1E: Device settings and Settings

**Interfaces:** Consumes `Sheet`, `Field`, `Chip`, `Button{variant:'danger',icon:'trash',size}`,
`Group`, `ListItem{badge}`, `Badge`, `ErrorLine`, `SegmentedControl`, `Toggle`, `Banner`, `Spinner`,
`Skeleton`, `useToast`, `device.removed`, `common.saved`.

Mock: `DeviceSheet` renders inside `<Sheet open title={t('device.title')} onClose={router.back}>`
(route `app/device-sheet/[id].tsx` unchanged apart from that; 1C sets its presentation). Name: `Field`
+ `Button size="small" variant="secondary"` side by side; save → `toast.show(t('common.saved'),
{kind:'ok'})`. Room chips. Order: two small secondary buttons with `up`/`down` icons. How it's
connected: `Group` of `ListItem`s (link name, host subtitle, `Badge ok 'main'` / neutral `'backup'`),
`addTv.pairAgain` row with chevron. Remove: `Button variant="danger" icon="trash"`; confirm view
replaces the body: heading `device.removeAsk`, `device.confirmRemove` (danger), `common.cancel`
(secondary). After removing: `toast.show(t('device.removed'), {kind:'ok'})`, then
`router.dismissAll()` back to Home. Loading: sheet with 3 `Skeleton` bars. Settings: theme
`SegmentedControl` (System/Light/Dark, labels `settings.theme*`), toggles in a `Group`, Rooms /
Privacy / About as expandable `ListItem trailing="expand"` with `expanded`; Privacy body is a
`Banner tone="ok" icon="lock"`. RoomsEditor rows: `Input` + small `Save`, up/down icon buttons,
`Delete`. TvLinkActions: small buttons, status line with `Spinner sm`, code `Field` + `ErrorLine`.
IrBackupAction: secondary button, `ErrorLine` on failure.

- [ ] **Step 1: Failing tests:** **Review Focus 2:** remove a device → `t('device.removed')` is in
  `testID 'toast'` after the sheet closes, and `jest.runAllTimers()` logs no act/unmount error; theme
  segment `settings.themeDark` keeps `accessibilityState.selected` (existing test unchanged); remove
  button bg `dangerSoft`; connected rows show `device.main` as a badge; dark render of the sheet uses
  `darkTokens.color.bg`; existing `deviceSheet`/`settings`/`tvLinkActions`/`irBackup` tests stay green.
- [ ] **Step 2: Run** the owned test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(device): show device settings as a bottom sheet and restyle Settings`.

### Task 1F: TV shell

**Interfaces:**
- Consumes `Screen{bare}`, `IconButton`, `StatusDot`, `Menu`, `Sheet`, `ListItem`, `Badge`, `Banner`,
  `EmptyState`, `Spinner`, `Skeleton`, `useToast`, `KeyButton`/`MicButton` props from 0.4.
- Produces: `TvState.currentInputId?: string` in `src/core/model.ts` (optional; no driver sets it yet).
  `TvMode` unchanged; the trust-lost body is screen state `trustLost: boolean`, set when a send fails
  with `DeviceError` code `notPaired`, cleared after pairing.

Mock: bar = back `IconButton`, title heading + caption with `StatusDot` (`ok` connected, `warn` IR
(`tv.statusIr`), `live` while connecting), `IconButton power tone="power"`, `keyboard` (when text),
`more` with `expanded`. Delete `BarButton.tsx` and `PowerGlyph`. Menu via `Menu` items: live →
Touchpad, D-pad (`current` = pad in use), Input, `dividerBefore` Device settings; not live → Device
settings only. Connecting: skeleton pad (`Skeleton` full pad) + pill with `Spinner sm` +
`tv.statusConnecting`, keys at opacity .45. Off/waking/wake failed/can't turn on: `EmptyState`-like
panel: art 96 radius art with `power` (`ink2`; `warm` tone when wake failed), heading, body, 56 button
(`Spinner` while waking). Unreachable: art `wifioff` warm, two stacked buttons, note. Trust lost:
dimmed pad + `Banner tone="error" icon="lock"` `tv.errNotPaired` + `Button addTv.pairAgain` → opens
the device sheet. Key send errors (`errNotSent`, `errTimeout`) → `toast.show(..., {kind:'error',
action:{label:t('common.retry'), onPress: resend}})` instead of the inline line; voice problems stay
as the caption line under the keys (`Txt live`). `MicButton onSent` → caption `tv.voiceSent` in
`okInk` with a `check` icon, gone after 1600 ms. Keyboard and Inputs open in `Sheet`s; Inputs list =
`Group` of `ListItem`s, current input (`currentInputId`) gets `Badge tone="accent" label={t('tv.inputNow')}`,
disconnected inputs `disabled`; `common.done` button in the sheet footer. No mic → Back and Home
centred with a 56 px gap.

- [ ] **Step 1: Failing tests** (`tvScreen.test.tsx`): `t('tv.more')` button has
  `accessibilityState.expanded` true while open; **Review Focus 3:** with the menu open, firing the
  screen's Android back handler (`BackHandler` mock `hardwareBackPress`) closes the menu and does not
  call `router.back`; a timed-out key send shows `t('tv.errTimeout')` in `testID 'toast'`; a
  `notPaired` failure shows the `tv.errNotPaired` banner and `addTv.pairAgain` button; inputs sheet
  marks `currentInputId` with `t('tv.inputNow')`; `onSent` shows `t('tv.voiceSent')` then it is gone
  after 1600 ms; dark render: bar power icon colour `darkTokens.color.dangerInk`. Existing selectors
  (`tv-menu`, `tv-off`, `tv-unreachable`, `tv-keyboard`, `tv-inputs`, `tv-screen`) still resolve.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/tv/tvScreen.test.tsx tests/screens/tv/tvMode.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Menu back: `BackHandler.addEventListener('hardwareBackPress')` while open.
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tv): rebuild the TV bar, panels, menu and sheets from the mock`.

### Task 1G: TV controls

**Interfaces:**
- Consumes `KeyButtonProps`, `MicButtonProps.onSent` (0.4), `useMotion`, `AnimatedBox`.
- Produces in `src/ui/tv/`: `DotGrid(props: { spacing?: number /*28*/ })` (svg pattern of 1.5 px
  `line` dots), `TouchDot(props: { x: SharedValue<number>; y: SharedValue<number>; visible:
  SharedValue<number> })`, `TapRipple(props: { x: number; y: number; trigger: number })`,
  `PulseRings(props: { active: boolean })`, `Equaliser(props: { active: boolean })`. Used only by 1G.
- Must not change `src/screens/tv/touchpad.ts` (the gesture controller) or its tests.

Mock: touchpad radius lg, `surface` + dot grid + line border + card shadow; hint 15 `ink2` centred,
fades out (`base`) while touching; finger dot 44 `surface` with card shadow, line ring and a 10 px
`accentSoft` halo, appears in `fast` and follows the finger on the UI thread (shared values fed from
the existing gesture callbacks); tap ripple: 44 ring, 2 px `accent`, scale .6 → 2.6 over `base`.
D-pad: 300 ring `surface` + line + shadow, keys 84 with 30 px icons at top/bottom/left/right (6 px
inset), OK 100 `accent`, 22 bold, pressed scale .94 + `accentPressed`. Pads swap with a cross-fade +
scale .94 over `base` (reduced: fade). Bottom keys: Back 64, Home 84 (`surface`), mic 64 `ink`;
pressed scale .92; after a send a "sent" ring pulses 1 → 1.35 over `base`. Mic listening: `accent`,
scale 1.12 spring, two `accent` pulse rings staggered over `ambient` 1500 loop, a bubble
"Listening…" (`tv.listening`) with a 4-bar `Equaliser` above-right; pads dim to .55. Reduced: no
rings, no equaliser bars moving, no scale; the bubble still shows.

- [ ] **Step 1: Failing tests** (`pads.test.tsx`, `micButton.test.tsx`): `t('tv.up')` etc. still
  labelled; the D-pad OK key bg `accent`; `tv-touchpad` still has the hint `t('tv.touchpadHint')`;
  **Review Focus 1:** hold the mic (pressIn), then rerender under `reducedMotion` →
  `queryAllByTestId('mic-pulse')` is empty and `t('tv.listening')` is still shown; existing mic tests
  green; dark render: touchpad bg `darkTokens.color.surface`; `tests/screens/tv/touchpad.test.ts`
  untouched and green.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/tv`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tv): animate the touchpad, D-pad, keys and mic as in the mock`.

### Task 1H: Add a TV

**Interfaces:**
- Consumes `OptionCard`, `Field`, `ErrorLine`, `Banner`, `Button`, `ResultDisc`, `EmptyState`,
  `Rise`, `Spinner`, `useMotion`; copy `addTv.pairedFirst`, `addTv.localNetworkOff`, `common.openSettings`.
- Produces in `src/ui/addtv/`: `Radar(props: { searching: boolean })` (168, three `accent` 2 px rings
  scale .45 → 1.15, opacity .55 → 0 over 2400 ms, staggered 800 ms; core 72 `accent` with `tv` icon
  34), `PairRing(props: { secondsLeft: number; total: number; phase: 'wait'|'ok'|'bad' })` (132 svg,
  r 58, stroke 8, dasharray 364.4, `line` track, `accent` arc animating 1 s linear per second; `ok`
  → `ok` colour full ring + check 56; `bad` → `danger` + alert), `OtpCells(props: { value: string;
  length: number; invalid: boolean; onChange: (v: string) => void; accessibilityLabel: string })`
  (cells 48x60 radius tile, 26 bold tabular, current cell 2 px `accent`, invalid 2 px `danger` + shake;
  one hidden `Input` drives them and keeps the label).

Mock: brand step = `OptionCard`s. Find: `Radar searching`, `addTv.findTitle`, `findSub`, found rows
as `Card`s in `Rise` with `tv` tile, name, brand `Badge`, host. Nothing found: `Radar
searching={false}`, `sameWifi`, `stillLooking`, link `cantFind`. Local network denied (iOS only, after
a search ends with zero results and `Platform.OS === 'ios'`): `Banner tone="error" icon="lock"`
`addTv.localNetworkOff` + secondary `common.openSettings` → `Linking.openSettings()`. Manual IP:
`Field label={addTv.ipLabel}` with helper `manualHint`, errors `badIp`/`notLocal`/`noAnswer` via
`error` + `shakeKey`, button loading while checking. Pair Allow: `PairRing`, title `pairAllow`, body,
`waiting`, `promptMissing` link after 15 s. Success: `ResultDisc ok` + heading `addTv.pairedFirst`
(first pair) or `addTv.paired` (again). Denied/timeout/unreachable: `ResultDisc bad` + copy + Try
again. Pair code: `OtpCells` length 6, `codeWrong`, `codeNew`. Duplicate: `EmptyState art="tv"`.

- [ ] **Step 1: Failing tests** (`addTv.test.tsx`): first pairing shows `t('addTv.pairedFirst')`;
  pair-again flow still shows `t('addTv.paired')`; **Review Focus 1:** `Radar` under `reducedMotion`
  renders no `testID 'radar-ping'`; on iOS (`Platform.OS` mocked) an empty search shows
  `addTv.localNetworkOff` and `common.openSettings`, on Android it does not; `t('addTv.codeTitle')`
  label still resolves on the OTP input; wrong code shows `codeWrong`; dark: radar core bg
  `darkTokens.color.accent`. Existing addTv tests green.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/add/addTv.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(add-tv): add the radar, pairing ring, code cells and result discs`.

### Task 1I: AC and fan

**Interfaces:**
- Consumes `Screen`, `IconButton`, `SegmentedControl`, `Chip{icon}`, `Skeleton`, `StatusDot`,
  `useToast`, `ac.offHint`, plain AC/fan labels.
- Produces in `src/ui/appliance/`: `Dial(props: { value: number; min: number; max: number; on:
  boolean; tone: 'cool'|'ink2'|'accent'; caption: string; accessibilityLabel: string })` (290 svg,
  r 126, stroke 18, 270° arc rotated 135°, track `surface` over a `line` ring, arc length
  `2π·126·0.75`, offset `ARC·(1-(value-min)/(max-min))` animated `base` via `useAnimatedProps`; centre
  `Txt display` digits that roll 70 % up/down over `fast` on change, `°` in `displaySup`; off → arc
  hidden, `ink2` "Off" 52 px, caption `ac.offHint`), `Stepper(props: { icon: 'minus'|'plus'; label:
  string; onPress: () => void; disabled: boolean })` (64 round, icon 30 stroke 2.4, press .9),
  `LinkLine(props: { kind: StatusKind; text: string; onPress?: () => void })` (connected: `StatusDot
  ok` + underlined link; irOnly / needsIr: `ir` icon; fellBack: `warmSoft` pill), `SpeedBars(props: {
  value: number; max: 5; onPick: (n: number) => void; labelFor: (n: number) => string })` (row of 5,
  250 high, radius md, heights 32 % + steps, fill scaleY from bottom over `base`, press .96),
  `SpinningIcon(props: { name: IconName; spinning: boolean; speed: number })` (112 art tile, icon 56,
  one turn per `2400 / speed` ms; reduced or off: still).
- `useDeviceView` returns `{ state: 'loading' } | { state: 'gone' } | { state: 'ready'; view }`
  (was `DeviceView | undefined`) so loading shows a skeleton dial instead of "not in the app".

Mock: AC bar: back, name, subtitle `ac.subtitleTemp`, `IconButton power tone="power"` (no settings
icon: Device settings opens from the `LinkLine`). Dial tone: cool/dry → `cool`, fan → `ink2`, auto →
`accent`. Steppers bottom-left/right. Mode `SegmentedControl` with `snow`/`drop`/`wind`/`auto`.
Chips: fan (`wind`, cycles), `swing`, `sleep` (`moon`). Fan: `SpinningIcon fan`, `SpeedBars`, chips
Boost (`bolt`), Sleep (`moon`), Light (`bulb`), timer chips. Errors → toast (`error.notSent` with
`common.retry` action, `timeout`, `partial`, `needsIr`, fan `unsupported`). Removed (`state:
'gone'`): the mock's "no longer exists" screen, `ac.notFound` / `fan.notFound` in an `EmptyState
art="alert"` (the "Device removed" toast is raised by 1E when the person removes it).

- [ ] **Step 1: Failing tests** (`acScreen.test.tsx`, `fanScreen.test.tsx`): `t('ac.raise')` /
  `t('ac.lower')` still labelled; mode segment `t('ac.mode.cool')` = 'Cool' is `selected`; off AC
  shows `t('ac.offHint')`; while the view loads `testID 'dial-skeleton'` shows and `ac.notFound` does
  not; send failure shows `ac.error.notSent` in `toast`; **Review Focus 4:** render the dial in light,
  rerender in dark → arc stroke `darkTokens.color.cool`; fan `SpinningIcon` under `reducedMotion`
  has rotation 0; `t('fan.speed', {n})` labels still resolve; link line connected text has no `●`.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/appliance`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(appliance): add the AC dial, fan speed bars and link line`.

### Task 1J: Add an AC or fan, IR test, Matter

**Interfaces:**
- Consumes `OptionCard{badge}`, `ProgressBar`, `Field`, `ErrorLine`, `EmptyState`, `ResultDisc`,
  `Spinner`, `Button`, `useMotion`.
- Produces in `src/ui/add/`: `IrPhone(props: { firing: boolean })` (120x160, `ir` icon 64, three
  14 px `accent` rings rising and growing over 900 ms staggered 300 ms while firing),
  `CameraFrame(props: { locked: boolean; hint: string; lockLabel: string; children: ReactNode })`
  (280 high, radius lg, `cameraBg`, hint at top 14/600 `cameraInk`, four 36 px corner brackets 4 px
  `cameraInk` radius tile, 188 → 150 with spring and `cameraLock` colour when locked, beam 176x3
  `cameraBeam` sweeping ±84 px over 1800 ms alternate (none when locked or reduced), lock badge
  `cameraBadge` pill with `check`), `StepList(props: { steps: readonly { label: string; state:
  'idle'|'active'|'done'|'fail' }[] })` (card, rows 64, icon disc 32: active = `Spinner sm` in an
  `accent` ring, done = `ok` disc + `onFill` check, fail = `danger` disc + `close`, pop .6 → 1 over
  `base` spring).

Mock: Brand: `OptionCard` with `Badge accent 'Matter'` where the brand has Matter, disabled "Other
brands · Not yet supported" card, link "Brand missing? Tell us". IR test: `ProgressBar` (try n of
total) + caption `Panasonic · try 1 of 6`, `IrPhone firing={busy}`, heading, primary Test (`play`
icon) **or** the Yes / No pair after a send, ghost Skip; errors as `ErrorLine`. No codes:
`EmptyState art="alert"`; no IR: `EmptyState art="ir"`. Matter scan: `CameraFrame` around
`CameraView`, `locked` once `onScan` sees a valid code; camera denied: `surface2` panel with
`cameraoff` icon + `matter.cameraDenied`; bad code `ErrorLine`; typed code `Field`. Commissioning:
`StepList` with `matter.step.*`, error under the list, Try again + Not now; success `ResultDisc ok`.

- [ ] **Step 1: Failing tests:** `findByText('Panasonic · try 1 of 5')` (existing) still passes;
  after Test is pressed, `t('addAppliance.yes')` shows and Test is gone; progress bar
  `accessibilityValue.now` matches try/total; `CameraFrame` under `reducedMotion` renders no
  `testID 'scan-beam'`; commissioning failure shows `matter.error.unreachable` and the failed step has
  `testID 'step-fail'`; dark: `StepList` card bg `darkTokens.color.surface`. Existing tests green.
- [ ] **Step 2: Run** `bunx jest --maxWorkers=2 tests/screens/add`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite + tsc + lint. Expected: PASS.
- [ ] **Step 5: Commit** `feat(add-appliance): restyle brand, IR test and Matter steps to the mock`.

---

## Wave 2: integration (one agent)

| Task | Files owned | Depends on | Merge order |
|---|---|---|---|
| 2 Integrate, verify, ship to the phone | everything (conflict fixes only), the mock | all of Wave 1 | merges 1A → 1J into `lane/app-mock`, then asks before `lane/app-mock` → `main` |

### Task 2: Merge, full tests, mock edits, release build, phone check

- [ ] **Step 1: Merge** each Wave 1 branch into `lane/app-mock` in the table order with
  `git merge --no-ff lane/mock-<id> -m "chore: merge <summary> (lane/mock-<id>)"`. After each merge:
  `bunx jest --maxWorkers=2`, `bunx tsc --noEmit`, `bun run lint`. Expected: PASS before the next
  merge. A conflict outside barrels means a task broke ownership: fix it here and note it.
- [ ] **Step 2: Apply the mock edits** every Wave 1 report listed, in place in
  `docs/design/one-remote-mockup.html`. Commit `docs(design): record what the build changed in the mock`.
- [ ] **Step 3: Glyph sweep.** `grep -rnE "[‹›⌨⋮⚙⏻←⌂▲▼◀▶📺❄🌀●]" src/screens src/ui` returns only
  copy that the mock keeps (`tv.errNotPaired` "⋯", `add.newRoom` "＋", `addTv.manualHint` "›").
- [ ] **Step 4: Release build.** `bunx expo prebuild -p android --clean`, then in `android/`
  `ANDROID_HOME=$HOME/Android/Sdk ./gradlew :app:assembleRelease -q`; install with `adb install -r`.
  Expected: build succeeds, app opens to the launch mark then Home.
- [ ] **Step 5: Phone check**, light then dark (system setting), then with Android "Remove
  animations" on: launch, Home (loading, empty, loaded, no-IR), long-press → device sheet (back key
  closes it), Settings (theme segment, accordions), TV (touchpad dot follows the finger, D-pad via ⋮,
  mic hold, keyboard and inputs sheets, off panel), AC (dial, modes, off), fan (bars, spin), add TV
  (radar, pair ring), add AC (IR test, Matter camera frame). Write down anything that does not match
  the mock frame and fix or report it.
- [ ] **Step 6: Report and ask** before merging `lane/app-mock` into `main`. Do not push.

---

## Self-review notes

- Spec coverage: every `CH` token row → 0.2 (Card ring → 1B, Icons → 0.3, Toggle off track unchanged).
  Copy section + the token-table note → 0.4. Motion `MOT`/`EAS` → 0.2 tokens, used in 1A-1J. Dark
  theme → dark test in every task + Wave 2 phone check. Screen index rows: Start/Home → 1C/1D; TV →
  1F/1G; Voice → 1F (caption, sent) + 1G (mic); AC/Fan → 1I; Add TV → 1H; Add AC/IR/Matter/IR backup
  → 1J/1E; Device settings, TV link actions, Settings → 1E; Components → 0.3/1A/1B/1C.
- Not built: the iOS system alert frames (OS dialogs), backdrop blur, the mock's QR drawing (the real
  camera feed is shown), exact 380 ms push on iOS (system timing).
