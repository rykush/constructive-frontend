import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const repo = '/constructive-frontend/'

export default defineConfig({
  base: repo,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Конструктив',
        short_name: 'Конструктив',
        description: 'Real-time chat app',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: repo,
        icons: [
          {
            src: `${repo}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${repo}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})