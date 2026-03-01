import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry (types + re-exports)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'next'],
  },
  // Client components
  {
    entry: ['src/client/index.ts'],
    outDir: 'dist/client',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', 'react-dom', 'next'],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      };
    },
  },
  // Server utilities
  {
    entry: ['src/server/index.ts'],
    outDir: 'dist/server',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['stripe', 'near-api-js'],
  },
]);
