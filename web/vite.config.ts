import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Vite writes its build output into the Go `internal/assets/dist` directory so
// that `//go:embed all:dist` in `internal/assets/assets.go` picks it up.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(here, '../internal/assets/dist'),
    emptyOutDir: true,
  },
});
