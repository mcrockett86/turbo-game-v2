import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'turbo-web/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    restoreMocks: true,
  },
});
