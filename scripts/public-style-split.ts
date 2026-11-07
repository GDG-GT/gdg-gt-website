import type { Plugin } from "vite";
import { preparePublicStyles, canonicalStyleFiles } from "./lib/public-styles.mjs";
export function publicStyleSplit(): Plugin {
  return {
    name: "gdg-public-style-split",
    async buildStart() { await preparePublicStyles(); },
    configureServer(server) {
      let active = true, pending = Promise.resolve();
      const update = (file: string) => {
        if (!canonicalStyleFiles.some((source) => file.endsWith("/" + source)) && !/\/src\/.*\.[cm]?[jt]sx?$/.test(file)) return;
        // Regeneration owns its queue. It must not hold Vite's environment HMR
        // hook open while a server-config dependency triggers a restart.
        pending = pending.then(async () => { if (active) await preparePublicStyles(); }).catch(() => {
          if (active) server.config.logger.error("Public stylesheet regeneration failed. Run node scripts/prepare-public-styles.mjs to inspect the source.");
        });
      };
      server.watcher.on("change", update);
      server.httpServer?.once("close", () => { active = false; server.watcher.off("change", update); });
    },
  };
}
