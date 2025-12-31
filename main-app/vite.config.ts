import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 3000,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
