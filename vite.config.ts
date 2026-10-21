import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { localPreview } from "./scripts/local-preview";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
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
    minify: true,
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
          ],
          "admin-vendor": ["@supabase/supabase-js", "@tanstack/react-query"],
          "three-vendor": ["three", "@react-three/fiber", "@react-three/drei"],
          // NOTE: do NOT manually chunk tldraw — splitting `tldraw` from its
          // @tldraw/* sub-packages breaks its cross-package singletons at
          // runtime ("p is not a function"). The lazy import in
          // AdminWhiteboard already code-splits it on its own.
        },
      },
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
