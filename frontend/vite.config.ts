import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      'zk-opengov-client-lib': path.resolve(__dirname, '../client-lib/src/index.ts'),
    },
  },
});
