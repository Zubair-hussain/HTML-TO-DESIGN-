import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. Framer loads the dev server (npm run dev) during
// development and the built assets in dist/ once published.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    sourcemap: true
  }
});
