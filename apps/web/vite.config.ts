import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const projectRootDir = resolve(__dirname);

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, './package.json'), 'utf-8'),
);

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@worker',
        replacement: resolve(projectRootDir, '../worker/src'),
      },
      {
        find: '@web',
        replacement: resolve(projectRootDir, './src'),
      },
    ],
  },
  build: {
    emptyOutDir: true,
    outDir: resolve(projectRootDir, 'dist'),
  },
});
