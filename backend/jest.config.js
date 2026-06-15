module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/routes/admin.js',
    'src/routes/courses.js',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
    },
  },
  testMatch: ['**/__tests__/course.api.test.js'],
};
