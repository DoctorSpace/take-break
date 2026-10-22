import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  base: './',
  plugins: [react()],
  resolve: {alias: [{find: /^react-native$/, replacement: 'react-native-web'}]},
  build: {outDir: '../build/web', emptyOutDir: true},
  server: {port: 5173, strictPort: true},
});
