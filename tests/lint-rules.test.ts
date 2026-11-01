import { spawnSync } from 'child_process';
import * as fs from 'fs';
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

  it('bans react-native in src/core, src/device, src/ir, src/tv and src/matter', () => {
    for (const dir of ['core', 'device', 'ir', 'tv', 'matter']) {
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

  it('bans the lan-socket module outside src/transport, by import, require and import()', () => {
    const where: [string, string][] = [
      ['src/webos/x.ts', '../../modules/lan-socket'],
      ['src/services/x.ts', '../../modules/lan-socket/index'],
      ['src/device/x.ts', '../../modules/lan-socket'],
      ['src/screens/x.tsx', '../../modules/lan-socket'],
      ['src/ui/x.tsx', '../../modules/lan-socket'],
      ['src/ui/primitives/x.tsx', '../../../modules/lan-socket'],
      ['app/x.tsx', '../modules/lan-socket'],
      ['app/dev/tv-spike.tsx', '../../modules/lan-socket'],
      ['src/store/x.ts', 'lan-socket'],
    ];
    for (const [file, spec] of where) {
      expect(errorsFor(`import '${spec}';\nexport const x = 1;\n`, file)).toContain(
        'no-restricted-imports',
      );
    }
    expect(
      errorsFor("export const m = require('../../modules/lan-socket');\n", 'src/webos/x.ts'),
    ).toContain('no-restricted-syntax');
    expect(
      errorsFor("export const m = import('../../modules/lan-socket');\n", 'src/services/x.ts'),
    ).toContain('no-restricted-syntax');
  });

  it('allows the mic-pcm module only in src/voice', () => {
    const src = "import '../../modules/mic-pcm';\nexport const x = 1;\n";
    for (const file of [
      'src/transport/x.ts',
      'src/webos/x.ts',
      'src/services/x.ts',
      'src/screens/x.tsx',
      'src/ui/x.tsx',
      'app/x.tsx',
    ]) {
      expect(errorsFor(src, file)).toContain('no-restricted-imports');
    }
    expect(errorsFor(src, 'src/voice/x.ts')).not.toContain('no-restricted-imports');
  });

  it('keeps screens from importing src/voice directly', () => {
    expect(
      errorsFor("import '@/voice/mic';\nexport const x = 1;\n", 'src/screens/x.tsx'),
    ).toContain('no-restricted-imports');
  });

  it('bans loading the LanSocket native module by name outside modules/lan-socket', () => {
    const sources = [
      "import { requireNativeModule } from 'expo';\nexport const m = requireNativeModule('LanSocket');\n",
      "import * as E from 'expo';\nexport const m = E.requireOptionalNativeModule('LanSocket');\n",
      "import { NativeModules } from 'react-native';\nexport const m = NativeModules.LanSocket;\n",
    ];
    for (const file of ['src/services/x.ts', 'src/transport/x.ts']) {
      for (const src of sources) expect(errorsFor(src, file)).toContain('no-restricted-syntax');
    }
    expect(errorsFor(sources[0] ?? '', 'modules/lan-socket/index.ts')).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('allows the lan-socket module in src/transport', () => {
    expect(
      errorsFor(
        "import { lanSocket } from '../../modules/lan-socket';\nexport const x = lanSocket;\n",
        'src/transport/x.ts',
      ),
    ).not.toContain('no-restricted-imports');
  });

  it('allows dgram in src/transport', () => {
    expect(
      errorsFor("import 'dgram';\nexport const x = 1;\n", 'src/transport/udp.ts'),
    ).not.toContain('no-restricted-imports');
  });

  it('bans fetch, XMLHttpRequest and WebSocket reached through a global object', () => {
    for (const obj of ['globalThis', 'window', 'global', 'self']) {
      for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket']) {
        expect(errorsFor(`export const x = ${obj}.${name};\n`, 'src/screens/zz.ts')).toContain(
          'no-restricted-properties',
        );
      }
    }
    expect(
      errorsFor('export const x = new globalThis.WebSocket("ws://x");\n', 'src/screens/zz.ts'),
    ).toContain('no-restricted-properties');
    expect(
      errorsFor("export const x = globalThis['XMLHttpRequest'];\n", 'src/screens/zz.ts'),
    ).toContain('no-restricted-properties');
    expect(
      errorsFor('const { fetch: f } = globalThis;\nexport const x = f;\n', 'app/zz.tsx'),
    ).toContain('no-restricted-properties');
  });

  it('bans fetch and XMLHttpRequest on a global object even in src/transport', () => {
    expect(errorsFor('export const x = globalThis.fetch;\n', 'src/transport/x.ts')).toContain(
      'no-restricted-properties',
    );
    expect(errorsFor('export const x = window.XMLHttpRequest;\n', 'src/transport/x.ts')).toContain(
      'no-restricted-properties',
    );
  });

  it('allows globalThis.WebSocket in src/transport', () => {
    expect(
      errorsFor('export const s = new globalThis.WebSocket("ws://x");\n', 'src/transport/ws.ts'),
    ).not.toContain('no-restricted-properties');
  });

  it('bans expo/fetch in every folder', () => {
    const files = [
      'src/core/x.ts',
      'src/device/x.ts',
      'src/store/x.ts',
      'src/transport/x.ts',
      'src/services/x.ts',
      'src/screens/x.tsx',
      'src/ui/x.tsx',
      'src/ui/primitives/x.tsx',
      'src/theme/x.ts',
      'src/i18n/x.ts',
      'app/x.tsx',
      'tests/x.test.ts',
    ];
    for (const file of files) {
      expect(
        errorsFor("import { fetch } from 'expo/fetch';\nexport const f = fetch;\n", file),
      ).toContain('no-restricted-imports');
    }
  });

  it('makes require of dgram, react-native-udp or expo/fetch an error outside src/transport', () => {
    for (const mod of ['dgram', 'node:dgram', 'react-native-udp', 'expo/fetch']) {
      for (const file of ['src/screens/zz.ts', 'src/services/zz.ts', 'app/zz.tsx']) {
        expect(errorsFor(`export const m = require('${mod}');\n`, file)).toContain(
          'no-restricted-syntax',
        );
      }
    }
    expect(errorsFor("export const m = import('dgram');\n", 'src/screens/zz.ts')).not.toEqual([]);
  });

  it('bans require of expo/fetch even in src/transport, but allows dgram there', () => {
    expect(errorsFor("export const m = require('expo/fetch');\n", 'src/transport/x.ts')).toContain(
      'no-restricted-syntax',
    );
    expect(errorsFor("export const m = require('dgram');\n", 'src/transport/x.ts')).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('applies the network bans to JavaScript files too', () => {
    for (const file of [
      'src/screens/zz.js',
      'app/zz.jsx',
      'src/services/zz.mjs',
      'src/ui/zz.cjs',
    ]) {
      expect(errorsFor("fetch('https://x.com');\n", file)).toContain('no-restricted-globals');
    }
    expect(
      errorsFor("const m = require('dgram');\nmodule.exports = m;\n", 'src/screens/zz.js'),
    ).toContain('no-restricted-syntax');
  });

  it('bans loading a module by a template literal', () => {
    for (const file of ['src/screens/zz.ts', 'src/transport/zz.ts']) {
      expect(errorsFor('export const m = require(`dgram`);\n', file)).toContain(
        'no-restricted-syntax',
      );
      expect(errorsFor('export const m = import(`expo/fetch`);\n', file)).toContain(
        'no-restricted-syntax',
      );
    }
  });

  it('runs lint with --max-warnings=0', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.lint).toMatch(/--max-warnings[= ]0\b/);
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
