import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// The same bundle ships two ways:
//   - Tauri webview: served from the app bundle at `/`, no base prefix.
//   - GitHub Pages PWA: served from `/paperplate/`, needs the prefix on
//     every asset URL Vite emits.
// `BUILD_TARGET=pwa npm run build` switches into the second mode; Tauri
// builds (`npm run tauri:build`) leave it unset.
const isPwaBuild = process.env.BUILD_TARGET === "pwa";

export default defineConfig(async () => ({
  plugins: [react()],
  base: isPwaBuild ? "/paperplate/" : "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
