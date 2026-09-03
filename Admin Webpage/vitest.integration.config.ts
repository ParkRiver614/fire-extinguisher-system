import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/integration/setup.ts'],
    include: ['src/integration/**/*.integration.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // 실제 서버에 순차적으로 요청하므로 병렬 실행하지 않음
    fileParallelism: false,
  },
})
