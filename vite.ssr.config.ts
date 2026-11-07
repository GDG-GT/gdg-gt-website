import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  envDir: false,
  resolve: { alias: { "@": path.resolve("src") } },
  esbuild: { jsx: "automatic" },
  define: { __DEV__: false, "import.meta.env.VITE_REAL_API": JSON.stringify("true"), "import.meta.env.VITE_LOCAL_UI": JSON.stringify("false") },
  build: { ssr: "src/ssr-entry.tsx", outDir: ".build/ssr", emptyOutDir: true, rollupOptions: { output: { entryFileNames: "entry.mjs" } } },
});
