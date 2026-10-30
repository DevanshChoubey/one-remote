import { spawnSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ESLINT_BIN = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');

// ESLint loads its config with a dynamic import(), which Jest's VM cannot do, so run it as a child
// process. import/no-cycle is off because it needs the file to exist on disk.
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

describe('architecture lint rules', () => {
  it('bans raw React Native visuals in screens', () => {
    const errors = errorsFor(
      "import { View } from 'react-native';\nexport const X = View;\n",
      'src/screens/x.tsx',
    );
    expect(errors).toContain('no-restricted-imports');
  });

  it('bans react-native in src/webos', () => {
    expect(
      errorsFor(
        "import { Platform } from 'react-native';\nexport const p = Platform;\n",
        'src/webos/x.ts',
      ),
    ).toContain('no-restricted-imports');
  });

  it('bans react-native in src/core, src/device, src/ir and src/matter', () => {
    for (const dir of ['core', 'device', 'ir', 'matter']) {
      expect(
        errorsFor(
          "import { Platform } from 'react-native';\nexport const p = Platform;\n",
          `src/${dir}/x.ts`,
        ),
      ).toContain('no-restricted-imports');
    }
  });

  it('allows react-native in src/matter/native', () => {
    expect(
      errorsFor(
        "import { Platform } from 'react-native';\nexport const p = Platform;\n",
        'src/matter/native/x.ts',
      ),
    ).not.toContain('no-restricted-imports');
  });

  it('allows expo modules in src/services', () => {
    expect(
      errorsFor("import 'expo-constants';\nexport const x = 1;\n", 'src/services/x.ts'),
    ).not.toContain('no-restricted-imports');
  });

  it('bans fetch in src/device and in tests', () => {
    expect(errorsFor("export const r = fetch('x');\n", 'src/device/x.ts')).toContain(
      'no-restricted-globals',
    );
    expect(errorsFor("export const r = fetch('x');\n", 'tests/x.test.ts')).toContain(
      'no-restricted-globals',
    );
  });

  it('bans WebSocket outside src/transport', () => {
    expect(errorsFor('export const s = new WebSocket("ws://x");\n', 'src/webos/x.ts')).toContain(
      'no-restricted-globals',
    );
  });

  it('allows WebSocket in src/transport', () => {
    expect(
      errorsFor('export const s = new WebSocket("ws://x");\n', 'src/transport/ws.ts'),
    ).not.toContain('no-restricted-globals');
  });

  it('bans XMLHttpRequest everywhere', () => {
    expect(errorsFor('export const x = new XMLHttpRequest();\n', 'src/transport/x.ts')).toContain(
      'no-restricted-globals',
    );
  });

  it('bans dgram and react-native-udp outside src/transport', () => {
    expect(errorsFor("import 'dgram';\nexport const x = 1;\n", 'src/device/x.ts')).toContain(
      'no-restricted-imports',
    );
    expect(
      errorsFor("import 'react-native-udp';\nexport const x = 1;\n", 'src/services/x.ts'),
    ).toContain('no-restricted-imports');
  });

  it('allows dgram in src/transport', () => {
    expect(
      errorsFor("import 'dgram';\nexport const x = 1;\n", 'src/transport/udp.ts'),
    ).not.toContain('no-restricted-imports');
  });

  it('bans screens importing service modules directly', () => {
    expect(
      errorsFor("import '@/device/hub';\nexport const x = 1;\n", 'src/screens/x.tsx'),
    ).toContain('no-restricted-imports');
  });

  it('allows React Native visuals inside src/ui/primitives', () => {
    expect(
      errorsFor(
        "import { View } from 'react-native';\nexport const Box = View;\n",
        'src/ui/primitives/Box.tsx',
      ),
    ).not.toContain('no-restricted-imports');
  });
});
