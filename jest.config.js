module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/index.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    './src/services/referenceNumber.js': {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 95,
    },
    './src/utils/piiRedactor.js': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  setupFilesAfterEnv: [],
  testTimeout: 30000,
  verbose: true,
};
