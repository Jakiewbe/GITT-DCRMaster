import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
import { cwd } from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  // Keep Vite's root aligned with the resolved source path when launched
  // through the desktop junction (for example C:\Users\... -> D:\...).
  root: realpathSync(cwd()),
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
})
