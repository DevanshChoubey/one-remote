/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Every gate always applies: Jest fails if a gated folder goes missing, so a rename cannot
  // silently drop its gate.
  coverageThreshold: Object.fromEntries(
    ['core', 'device', 'store', 'transport'].map((dir) => [`./src/${dir}/`, { lines: 80 }]),
  ),
};
