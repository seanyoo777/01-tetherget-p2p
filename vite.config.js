import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /** 01번 P2P 전용: http://localhost:5171/ — 02-TGX-CEX 등이 5173을 쓰면 충돌 없이 병행 가능. */
  server: {
    port: 5171,
    strictPort: true,
  },
})