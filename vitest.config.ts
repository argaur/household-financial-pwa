import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Created by vite-plugin-pwa at build time; this config does not load the
      // plugin, so the specifier would fail to resolve under test.
      'virtual:pwa-register': path.resolve(__dirname, './src/test/pwa-register-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/.vercel/**', '**/dist/**', '**/.claude/worktrees/**'],
  },
})
