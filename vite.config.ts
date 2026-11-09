import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Test hooks (window.__app, __rally*, ?rally* URL params) exist only in the dev server and in a build made with
// VITE_TEST_HOOKS=1. The production build replaces the flag with `false`, so the hooks are removed from the bundle.
export default defineConfig(({ command, mode }) => ({
  define: {
    __TEST_HOOKS__: JSON.stringify(command === 'serve' || mode === 'test' || loadEnv(mode, '.', 'VITE_').VITE_TEST_HOOKS === '1'),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
}));
