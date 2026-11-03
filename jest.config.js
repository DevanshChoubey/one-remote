/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  // matter.js and its noble dependencies ship ES modules, so Jest has to transform them.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@noble|@matter|@project-chip))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  // Reanimated's Jest resolver swaps its native-only modules for the web ones, so hooks run in Node.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFiles: ['<rootDir>/tests/setup/reanimated.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Every gate always applies: Jest fails if a gated folder goes missing, so a rename cannot
  // silently drop its gate.
  coverageThreshold: Object.fromEntries(
    ['core', 'device', 'store', 'transport'].map((dir) => [`./src/${dir}/`, { lines: 80 }]),
  ),
};
