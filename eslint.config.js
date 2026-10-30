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

// Dev-only spike screens (app/dev/*-spike.tsx; each redirects to / unless __DEV__) drive services
// and drivers directly, so they may import service modules and React Native visuals. Each lane adds
// its spike file on its own line, just under its own slot comment. (ESLint rejects an empty `files`,
// so the override below is added only once a file is listed.)
const DEV_SPIKE_FILES = [
  // tv lane
  // ir lane
  // matter lane
];

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

// The same globals reached through a global object, e.g. `globalThis.fetch` or `window['fetch']`.
const GLOBAL_OBJECTS = ['globalThis', 'window', 'global', 'self'];

function bannedProperties(names) {
  return GLOBAL_OBJECTS.flatMap((object) =>
    names.map((property) => ({ object, property, message: NETWORK_MESSAGE })),
  );
}

const socketImports = {
  group: ['dgram', 'node:dgram', 'react-native-udp', 'react-native-udp/**'],
  message: 'Raw sockets (dgram, react-native-udp) are allowed only in src/transport.',
};

// expo/fetch ships a working fetch with the SDK, so it is banned in every folder, src/transport too.
const fetchImports = {
  group: ['expo/fetch', 'expo/fetch/**'],
  message: NETWORK_MESSAGE,
};

// no-restricted-imports does not see require() or import(). esquery regexes cannot hold a `/`,
// so `.` stands in for it.
const SOCKET_MODULE = '/^(node:)?dgram$|^react-native-udp($|.)/';
const FETCH_MODULE = '/^expo.fetch($|.)/';

function bannedLoads(moduleRegex, message) {
  return [
    {
      selector: `CallExpression[callee.name='require'][arguments.0.value=${moduleRegex}]`,
      message,
    },
    { selector: `ImportExpression[source.value=${moduleRegex}]`, message },
  ];
}

const fetchLoads = bannedLoads(FETCH_MODULE, NETWORK_MESSAGE);
const socketLoads = bannedLoads(SOCKET_MODULE, socketImports.message);

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
      'no-restricted-imports': [
        'error',
        { ...rnVisualRestriction, patterns: [socketImports, fetchImports] },
      ],
      'no-restricted-globals': [
        'error',
        ...bannedGlobals(['fetch', 'XMLHttpRequest', 'WebSocket']),
      ],
      'no-restricted-properties': [
        'error',
        ...bannedProperties(['fetch', 'XMLHttpRequest', 'WebSocket']),
      ],
      'no-restricted-syntax': ['error', ...socketLoads, ...fetchLoads],
    },
  },
  // Sockets belong to src/transport only.
  {
    files: ['src/transport/**'],
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals(['fetch', 'XMLHttpRequest'])],
      'no-restricted-properties': ['error', ...bannedProperties(['fetch', 'XMLHttpRequest'])],
      'no-restricted-syntax': ['error', ...fetchLoads],
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
          patterns: [domainLayering, socketImports, fetchImports],
        },
      ],
    },
  },
  // src/transport is the only place for sockets, so it is exempt from the socket-import ban.
  {
    files: ['src/transport/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { ...rnVisualRestriction, patterns: [domainLayering, fetchImports] },
      ],
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
            fetchImports,
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
            fetchImports,
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
            fetchImports,
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
            fetchImports,
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
        { ...rnVisualRestriction, patterns: [...serviceImports, socketImports, fetchImports] },
      ],
      'import/no-default-export': 'off',
    },
  },
  // Dev-only spike screens: see DEV_SPIKE_FILES. The network bans still apply there.
  ...(DEV_SPIKE_FILES.length > 0
    ? [
        {
          files: DEV_SPIKE_FILES,
          rules: {
            'no-restricted-imports': ['error', { patterns: [socketImports, fetchImports] }],
          },
        },
      ]
    : []),
  // Tests may use any import, except a working fetch.
  {
    files: ['tests/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [fetchImports] }],
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
