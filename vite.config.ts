import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  // transformers.js bundles onnxruntime-web + WASM; let it resolve at runtime
  // rather than pre-bundling (which mangles the worker/WASM asset paths).
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
