import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /** 01번 P2P 전용: http://localhost:5173/ — 03-OneAI는 5180 (vite) 사용. */
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    open: true,
  },
})