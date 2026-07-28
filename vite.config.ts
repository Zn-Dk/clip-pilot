import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri 期望前端开发服务器使用固定端口
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  // 暴露 Tauri 注入的环境变量
  envPrefix: ['VITE_', 'TAURI_'],
})
