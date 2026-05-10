import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /** 로컬 테스트 기준 URL: http://localhost:5173/ — 다른 프로세스가 5173을 쓰면 기동 실패(포트 충돌 확인). */
  server: {
    port: 5173,
    strictPort: true,
  },
})