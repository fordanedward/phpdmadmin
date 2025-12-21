import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    chunkSizeWarningLimit: 1000, // Suppress chunk size warnings (in kB)
  },
  server: {
    proxy: {
      '/api-integrated_system': {
        target: 'http://localhost', // Backend server URL
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-integrated_system/, ''), // Optional path rewrite
      },
    },
  },
});
