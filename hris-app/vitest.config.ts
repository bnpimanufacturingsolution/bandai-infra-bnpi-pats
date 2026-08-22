import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20_000,
    setupFiles: ['app/test/setup.ts'],
    include: [
      'app/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/build/**',
      '**/.react-router/**',
      'tests/**/*.spec.ts',
      'tests/perf/**',
      'test-results/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
      '~': path.resolve(__dirname, './app'),
    },
  },
});
