import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // 127.0.0.1: o Node atual resolve "localhost" para IPv6 e a API escuta em IPv4.
    // Mantém o endereço acessado (Host): no SaaS, ele define a empresa (empresa.dominio ou o painel da plataforma).
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
})
