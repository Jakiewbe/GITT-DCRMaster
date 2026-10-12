import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Private, data-dependent historical audits are explicitly opt-in; they
    // write analysis artifacts and are not portable application regressions.
    exclude: ['tests/qualification/**', 'tests/performance/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/science/**/*.ts'],
      exclude: ['src/science/**/*.test.ts', 'src/science/index.ts'],
    },
  },
});
