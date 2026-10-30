const expoConfig = require('eslint-config-expo/flat');

const RN_VISUAL = ['View', 'Text', 'Pressable', 'TextInput', 'Image', 'ScrollView', 'StyleSheet'];

const rnVisualRestriction = {
  paths: [
    {
      name: 'react-native',
      importNames: RN_VISUAL,
      message:
        'Compose from the primitives in @/ui/primitives (Box, Row, Column, Txt, Touchable, Input, Spacer) instead.',
    },
  ],
};

const SERVICE_MODULES = ['device', 'store', 'transport', 'ir', 'webos', 'matter'];
// `services` is the composition root (useServices); it is layered like a domain module but is not pure.
const DOMAIN_FOLDERS = [
  'core',
  'device',
  'store',
  'transport',
  'ir',
  'webos',
  'matter',
  'services',
];
const PURE_FOLDERS = ['core', 'device', 'ir', 'webos', 'matter'];

const NETWORK_MESSAGE =
  'All networking lives in src/transport and goes through assertLocal(). fetch and XMLHttpRequest are banned.';

function bannedGlobals(names) {
  return names.map((name) => ({ name, message: NETWORK_MESSAGE }));
}

const socketImports = {
  group: ['dgram', 'node:dgram', 'react-native-udp', 'react-native-udp/**'],
  message: 'Raw sockets (dgram, react-native-udp) are allowed only in src/transport.',
};

const domainLayering = {
  group: ['@/screens', '@/screens/**', '@/ui', '@/ui/**', '**/app/**'],
  message: 'Domain modules must not import from app/, screens or ui.',
};

const serviceImports = SERVICE_MODULES.flatMap((m) => [
  {
    group: [`@/${m}`, `@/${m}/**`],
    message:
      'Screens reach services only through useServices(), never by importing service modules.',
  },
]);

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'coverage/**', 'bun.lock', 'docs/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/no-cycle': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      'no-restricted-imports': ['error', { ...rnVisualRestriction, patterns: [socketImports] }],
      'no-restricted-globals': [
        'error',
        ...bannedGlobals(['fetch', 'XMLHttpRequest', 'WebSocket']),
      ],
    },
  },
  // Sockets belong to src/transport only.
  {
    files: ['src/transport/**'],
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals(['fetch', 'XMLHttpRequest'])],
    },
  },
  // Layering. Domain modules never import app/, screens or ui.
  {
    files: DOMAIN_FOLDERS.map((d) => `src/${d}/**`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...rnVisualRestriction,
          patterns: [domainLayering, socketImports],
        },
      ],
    },
  },
  // src/transport is the only place for sockets, so it is exempt from the socket-import ban.
  {
    files: ['src/transport/**'],
    rules: {
      'no-restricted-imports': ['error', { ...rnVisualRestriction, patterns: [domainLayering] }],
    },
  },
  // Core, device, ir, webos and matter stay pure TypeScript so they run in plain Jest and Node.
  // src/matter/native holds the native module adapter, so it may import React Native.
  {
    files: PURE_FOLDERS.map((d) => `src/${d}/**`),
    ignores: ['src/matter/native/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            domainLayering,
            socketImports,
            {
              group: [
                'react-native',
                'react-native-*',
                'react-native/**',
                'expo',
                'expo-*',
                'expo/**',
                '@react-native-async-storage/*',
              ],
              message:
                'src/core, src/device, src/ir, src/webos and src/matter (except src/matter/native) must stay free of React Native and Expo.',
            },
          ],
        },
      ],
    },
  },
  // UI components may import only the theme, primitives and their peers.
  {
    files: ['src/ui/**'],
    ignores: ['src/ui/primitives/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...rnVisualRestriction,
          patterns: [
            {
              group: ['@/screens', '@/screens/**', '**/app/**'],
              message: 'src/ui must not import from screens or app.',
            },
            ...serviceImports,
            socketImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/primitives/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/screens', '@/screens/**', '@/ui', '@/ui/!(primitives)/**', '**/app/**'],
              message: 'Primitives only depend on the theme.',
            },
            ...serviceImports,
            socketImports,
          ],
        },
      ],
    },
  },
  // Screens: services only via useServices(); no raw RN visuals.
  {
    files: ['src/screens/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...rnVisualRestriction,
          patterns: [
            { group: ['**/app/**'], message: 'Screens must not import from app/.' },
            ...serviceImports,
            socketImports,
          ],
        },
      ],
    },
  },
  // Routes are thin: no raw RN visuals, no direct service-module imports.
  {
    files: ['app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { ...rnVisualRestriction, patterns: [...serviceImports, socketImports] },
      ],
      'import/no-default-export': 'off',
    },
  },
  // Tests may use any import.
  {
    files: ['tests/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  // Node-run CommonJS scripts and configs.
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];
