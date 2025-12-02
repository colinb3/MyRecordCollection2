import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    // Add bundle visualizer when ANALYZE env var is set to 'true'
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            filename: 'dist/stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:4000`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
