/** Unit tests: `*.spec.ts` next to the code. Integration tests live in test/jest-integration.json. */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/apps', '<rootDir>/libs', '<rootDir>/test'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: {
    '^@app/(common|config|contracts|database|kafka|observability|redis)(/.*)?$': '<rootDir>/libs/$1/src$2',
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-unit.ts'],
  collectCoverageFrom: [
    '{apps,libs}/**/*.ts',
    '!**/main.ts',
    '!**/index.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
  ],
  coverageDirectory: 'coverage',
};
