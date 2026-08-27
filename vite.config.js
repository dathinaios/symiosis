// Vite configuration for Tauri development
// https://vitejs.dev/config/

import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,

  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Test configuration
  test: {
    environment: 'happy-dom',
    globals: true,
  },

  // Component tests mount real components, which needs Svelte's client build.
  // Without this vitest resolves the server build and `mount()` throws.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
}));
