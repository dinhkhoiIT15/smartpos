import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // A sandboxed preload must be a bundled CommonJS file, not an ESM .mjs file.
    build: { rollupOptions: { output: { format: 'cjs' } } },
  },
  renderer: {
    base: './',
    plugins: [
      react(),
      {
        name: 'smartpos-renderer-csp',
        transformIndexHtml(html) {
          const development = command === 'serve';
          return html
            .replace('__SMARTPOS_SCRIPT_POLICY__', development ? "'self' 'unsafe-inline'" : "'self'")
            .replace(
              '__SMARTPOS_CONNECT_POLICY__',
              development ? "'self' ws://localhost:* ws://127.0.0.1:*" : "'self'",
            );
        },
      },
    ],
    server: { host: '127.0.0.1' },
  },
}));
