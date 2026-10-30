const fs = require('fs');
const path = require('path');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: Object.fromEntries(
    ['core', 'device', 'store', 'transport']
      // Jest errors on thresholds for folders with no files yet; lanes add them in waves.
      .filter((dir) => fs.existsSync(path.join(__dirname, 'src', dir)))
      .map((dir) => [`./src/${dir}/`, { lines: 80 }]),
  ),
};
