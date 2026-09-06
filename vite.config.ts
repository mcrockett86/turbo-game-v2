import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'turbo-web',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'turbo-web/src'),
    },
  },

  build: {
    outDir: '../dist',
    sourcemap: true,
  },

  server: {
    host: '0.0.0.0',
    port: 3094,
    strictPort: true,
  },
});
