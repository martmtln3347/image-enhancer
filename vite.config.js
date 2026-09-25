import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // TensorFlow.js est gros par nature, il est chargé à la demande
    chunkSizeWarningLimit: 2500,
  },
});
