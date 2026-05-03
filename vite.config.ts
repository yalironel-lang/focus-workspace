import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['legal-bats-post.loca.lt'],
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['legal-bats-post.loca.lt'],
  }
})