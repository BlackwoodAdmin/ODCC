import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Self-contained SSR bundle: React and friends are compiled in, so the
  // server never resolves them from node_modules (no client/server version
  // skew from partial deploys). Tests are unaffected — vitest.config.js takes
  // priority there. If these configs are ever merged, scope noExternal to the
  // SSR build only (the isSsrBuild config-function form).
  ssr: {
    noExternal: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000'
    }
  }
});