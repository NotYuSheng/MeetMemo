import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  // Use /MeetMemo/ base path only for GitHub Pages (when VITE_DEMO_MODE is set)
  base: process.env.VITE_DEMO_MODE === 'true' ? '/MeetMemo/' : '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://meetmemo-backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
}));
