import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 3001,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
