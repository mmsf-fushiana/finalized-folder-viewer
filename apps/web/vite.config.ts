import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/finalized-folder-viewer/' : '/',
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@ssr3-viewer/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@data': path.resolve(__dirname, '../../'),
    },
  },
});
