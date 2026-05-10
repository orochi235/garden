/// <reference types="vitest/config" />

import path from 'path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/garden/',
  server: {
    port: 53305,
  },
  plugins: [
    react(),
    {
      name: 'serve-visual-fixtures',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/tests/visual/fixtures/')) return next();
          try {
            const filePath = resolve(__dirname, '.' + req.url);
            const buf = readFileSync(filePath);
            res.setHeader('Content-Type', 'application/json');
            res.end(buf);
          } catch {
            res.statusCode = 404;
            res.end('not found');
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'drag-lab': path.resolve(__dirname, 'drag-lab.html'),
        'geometry-demos': path.resolve(__dirname, 'geometry-demos.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/**', '**/dist/**', 'tests/visual/**'],
  },
});
