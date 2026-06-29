import { defineConfig } from "vite";

// Minimal config: a single-page app served from the project root.
// `base: "./"` keeps asset paths relative so a production build can be dropped
// onto any static host (GitHub Pages, itch.io, a plain folder) without rewrites.
//
// Honour a PORT env var when one is provided (preview/CI harnesses assign one);
// otherwise fall back to Vite's default dev port.
export default defineConfig({
  base: "./",
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
    open: false,
  },
});
