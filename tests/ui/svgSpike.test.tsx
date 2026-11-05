import { spawnSync } from 'child_process';
import * as path from 'path';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { SvgSpike } from '../../app/dev/svg-spike';

const ROOT = path.resolve(__dirname, '..', '..');
const ESLINT_BIN = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');

// ESLint loads its config with a dynamic import(), which Jest's VM cannot do, so run it as a child
// process (same helper as tests/lint-rules.test.ts).
function errorsFor(source: string, filePath: string): string[] {
  const run = spawnSync(
    process.execPath,
    [
      ESLINT_BIN,
      '--stdin',
      '--stdin-filename',
      path.join(ROOT, filePath),
      '--format',
      'json',
      '--rule',
      'import/no-cycle: off',
    ],
    { cwd: ROOT, input: source, encoding: 'utf8' },
  );
  if (run.status !== 0 && run.status !== 1) {
    throw new Error(`ESLint crashed (status ${String(run.status)}): ${run.stderr}`);
  }
  const [result] = JSON.parse(run.stdout) as {
    messages: { ruleId: string | null; severity: number }[];
  }[];
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse');
}

describe('svg + reanimated spike', () => {
  it('renders an animated svg circle', async () => {
    await render(
      <ThemeProvider>
        <SvgSpike />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('svg-spike-arc')).toBeTruthy();
  });

  it('bans react-native-svg in screens', () => {
    expect(
      errorsFor(
        "import Svg from 'react-native-svg';\nexport const X = Svg;\n",
        'src/screens/x.tsx',
      ),
    ).toContain('no-restricted-imports');
  });

  it('bans the Reanimated default export in screens', () => {
    expect(
      errorsFor(
        "import Animated from 'react-native-reanimated';\nexport const X = Animated;\n",
        'src/screens/x.tsx',
      ),
    ).toContain('no-restricted-imports');
  });

  it('allows Reanimated hooks in screens', () => {
    expect(
      errorsFor(
        "import { useSharedValue } from 'react-native-reanimated';\nexport const X = useSharedValue;\n",
        'src/screens/x.tsx',
      ),
    ).toEqual([]);
  });
});
