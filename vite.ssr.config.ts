import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  envDir: false,
  resolve: { alias: { "@": path.resolve("src") } },
  esbuild: { jsx: "automatic" },
  // These packages select module-sync entrypoints on current Node. Bundle their
  // own chunks so function tracing cannot omit the selected router runtime.
  ssr: { noExternal: ["react-router-dom", "react-router"] },
  define: { __DEV__: false, "import.meta.env.VITE_REAL_API": JSON.stringify("true"), "import.meta.env.VITE_LOCAL_UI": JSON.stringify("false") },
  build: { ssr: "src/ssr-entry.tsx", outDir: ".build/ssr", emptyOutDir: true, rollupOptions: { output: { entryFileNames: "entry.mjs" } } },
});
