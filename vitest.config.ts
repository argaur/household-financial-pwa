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
    // `.claude/worktrees/` is where the Agent tool creates its worktrees;
    // `.worktrees/codex/` is where `dev-manager-codex-step.sh` creates its own.
    // Both hold a full second copy of `src/` and `server/`, so without these a
    // run with a worktree present silently doubles the suite (113 files/1718
    // tests became 227/3441 on 2026-09-11) and the totals stop meaning
    // anything. Worse, the copy is a *different commit*, so the suite could go
    // red or green on code that is not the code under test.
    exclude: [
      '**/node_modules/**',
      '**/.vercel/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
      '**/.worktrees/**',
    ],
  },
})
