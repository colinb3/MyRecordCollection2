import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { writeFileSync } from 'fs'

// Generate a unique build ID for cache busting
const buildId = Date.now().toString()

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
    // Generate version.json at build time for cache busting
    {
      name: 'generate-version',
      closeBundle() {
        writeFileSync('dist/version.json', JSON.stringify({ buildId }))
      }
    }
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
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
