import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/services/php': {
        target: 'http://core-dev:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://core-dev:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
