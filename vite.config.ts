/// <reference types="vitest/config" />

import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/garden/',
  server: {
    port: 53305,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'drag-lab': path.resolve(__dirname, 'drag-lab.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
