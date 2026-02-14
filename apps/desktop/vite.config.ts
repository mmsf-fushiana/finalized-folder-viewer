import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@ssr3-viewer/ui': resolve(__dirname, '../../packages/ui/src'),
      '@data': resolve(__dirname, '../../'),
    },
  },
});
