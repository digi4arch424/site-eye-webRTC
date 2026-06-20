/**
 * vite.config.js
 *
 * Builds src/main.js into dist/bundle.js as an IIFE.
 * The IIFE executes on load and assigns exported classes/functions
 * to window.* so existing vanilla JS files (location.js, markers.js)
 * can reference them without any import statement.
 *
 * Usage in HTML:
 *   <script src="dist/bundle.js"></script>   ← load FIRST
 *   <script src="location.js"></script>
 *   <script src="markers.js"></script>
 *
 * Phase 2 note:
 *   When the Multiset SDK becomes a dependency, add it here under
 *   optimizeDeps.include and update multiset-provider.js accordingly.
 *
 * js-aruco2 note:
 *   No optimizeDeps entry is needed for js-aruco2. It is never imported
 *   as a normal module — only its raw source text is loaded via Vite's
 *   `?raw` suffix (see src/aruco-detector.js for why). `?raw` imports are
 *   treated as static assets, not JS modules, so Vite's dependency
 *   pre-bundling step doesn't apply to them.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry:    'src/main.js',
      name:     '_bimBundle',  // global var name; unused since window.* is assigned manually
      formats:  ['iife'],
      fileName: () => 'bundle.js',
    },
    outDir:      'dist',
    emptyOutDir: true,
    sourcemap:   true,   // flip to false when shipping Phase 3 production build
    minify:      false,  // keep readable during Phase 1 development
  },
});
