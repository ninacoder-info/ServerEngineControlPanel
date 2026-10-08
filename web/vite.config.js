import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://core-dev:8000',
        changeOrigin: true,
        ws: true,
      },
      // PHP info is rendered by the Python control plane as a real HTML
      // document. Keep the React `/services/php` page intact, but forward
      // only the versioned info URL during Vite development.
      '^/services/php/[^/]+/info$': {
        target: 'http://core-dev:8000',
        changeOrigin: true,
      },
      // phpMyAdmin is served by the authenticated Python control plane
      // proxy, not by the React SPA fallback.
      '/phpmyadmin': {
        target: 'http://core-dev:8000',
        changeOrigin: true,
      },
    },
  },
});
