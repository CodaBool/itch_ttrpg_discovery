
// vite.config.js
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from "vite-plugin-svgr";

export default defineConfig({
  // keep .env in dir above root, as extra protection against codex reads
  envDir: resolve(__dirname, '..'),
  plugins: [
    react(),
    tailwindcss(),
    svgr(),
  ],
})