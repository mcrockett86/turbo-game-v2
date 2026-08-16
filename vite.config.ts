import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'turbo-web/src'),
    },
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'turbo-web/index.html'),
      },
    },
  },
  
  server: {
    port: 3094,
    strictPort: true,
  },
});
