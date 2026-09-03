import { defineConfig } from 'vitest/config'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // e2e(playwright)와 integration(실서버)은 각자 러너로 돌린다 — 유닛 테스트 수집에서 제외
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', 'src/integration/**'],
    css: false,
  },
})
