import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  server: {
    host: '::',
    port: 8080,
    hmr: { overlay: false },
    allowedHosts: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
