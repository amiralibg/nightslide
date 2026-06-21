import { defineConfig } from 'vite';

// NIGHTSLIDE build config.
// - `base: './'` keeps asset URLs relative so the build drops onto any static host.
// - Phaser is large; split it into its own chunk so the shell/app code stays cacheable.
// - Tweakpane and the dev tuning panel are dynamically imported behind `import.meta.env.DEV`,
//   so they are tree-shaken out of production bundles entirely.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    open: true,
  },
});
