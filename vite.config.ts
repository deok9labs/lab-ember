import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/lab-ember/',
  plugins: [react()],
  server: {
    // 운영과 동일한 /api 경로를 사용하면서 로컬에서는 Aster 개발 서버로 전달한다.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
