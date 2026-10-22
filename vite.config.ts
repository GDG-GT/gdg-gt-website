import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { localPreview } from "./scripts/local-preview";
import { VitePWA } from "vite-plugin-pwa";
import { readFile } from "node:fs/promises";
import { offlinePrecacheAssets } from "./scripts/lib/build-graph.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    watch: {
      ignored: [
        "**/node_modules.offloaded-backup/**",
        "**/excalidraw.offloaded-backup/**",
      ],
    },
    fs: {
      strict: true,
      // These files belong to local/server operations, never the browser.
      // Keep Vite's default secret exclusions when extending this list.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,local}",
        "**/.git/**",
        "**/.docs/**",
        "**/server/**",
        "**/database/**",
        "**/infra/**",
        "**/supabase/**",
      ],
    },
    proxy: {
      "/api/v1": { target: "http://127.0.0.1:8081", changeOrigin: false },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/pwa",
      filename: "sw.js",
      injectRegister: false,
      registerType: "prompt",
      manifest: false,
      devOptions: { enabled: false },
      injectManifest: {
        globPatterns: [
          "index.html",
          "offline.html",
          "manifest.json",
          "favicon.png",
          "logo.png",
          "icons/*.png",
          "assets/*.{js,css,woff2}",
        ],
        globIgnores: [
          "assets/subset-shared.chunk-*.js",
          "assets/percentages-*.js",
        ],
        // Heavy editors/3D chunks can stay network-only. They are never needed
        // to show the public offline fallback or review queued public actions.
        maximumFileSizeToCacheInBytes: 1024 * 1024,
        manifestTransforms: [
          async (entries) => {
            const manifest = JSON.parse(
              await readFile(path.resolve("dist/.vite/manifest.json"), "utf8"),
            );
            const allowed = offlinePrecacheAssets(manifest);
            const selected = entries.filter((entry) => allowed.has(entry.url));
            for (const asset of allowed)
              if (!selected.some((entry) => entry.url === asset))
                throw new Error(
                  "Offline dependency missing from precache: " + asset,
                );
            return { manifest: selected, warnings: [] };
          },
        ],
      },
    }),
    ...(mode === "development" &&
    loadEnv(mode, process.cwd(), "").VITE_LOCAL_UI === "true" &&
    loadEnv(mode, process.cwd(), "").VITE_REAL_API !== "true"
      ? [localPreview()]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    minify: true,
    sourcemap: mode === "development",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        offline: path.resolve(__dirname, "offline.html"),
      },
      // Let Rollup preserve shared dependency boundaries. Manual dependency
      // buckets pulled 3D into public/offline startup and created editor cycles.
    },
    // Increase chunk size warning limit since we have a content-heavy admin panel
    chunkSizeWarningLimit: 1000,
  },
  // Production environment optimizations
  define: {
    // Remove development-only code in production
    __DEV__: mode === "development",
  },
}));
