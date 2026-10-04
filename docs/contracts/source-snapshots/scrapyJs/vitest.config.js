module.exports = {
  test: {
    globals: true,
    include: ['test/**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 60,
        lines: 50,
      },
    },
  },
};
