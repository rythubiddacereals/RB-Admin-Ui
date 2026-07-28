import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite config for rb-admin-react.
 *
 * - Runs on port 5174 to avoid clashing with Rythubidda-UI (5173).
 * - `/api` requests proxy to the rb-admin Spring Boot backend on
 *   :8081 during dev so we don't fight CORS while iterating locally.
 *   In production the React static bundle will be served by Spring
 *   Boot under `/admin/*`, so same-origin — no proxy needed.
 * - `@` alias resolves to `src/` so imports stay short across a
 *   growing codebase.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
});
