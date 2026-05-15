import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    // Proxy socket.io requests to backend — fixes CORS completely
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})
