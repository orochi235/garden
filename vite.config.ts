/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/garden/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
