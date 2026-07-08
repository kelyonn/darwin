import { defineConfig } from "vite";

// Static, free-hostable bundle (PRD §1). `base` is relative so the build works
// under a GitHub Pages project subpath without further configuration.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
