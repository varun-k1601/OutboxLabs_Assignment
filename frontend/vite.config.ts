import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // proxy /api in dev so everything is on one origin (cookies just work, no CORS)
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': apiTarget,
        '/admin': apiTarget,
      },
    },
    preview: { port: 5173 },
  };
});
