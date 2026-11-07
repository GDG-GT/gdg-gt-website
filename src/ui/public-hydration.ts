import { useState } from "react";
import { readHomeContent } from "@/lib/content-snapshot";
import { readPublicSiteStatus } from "../../shared/public-site-status-read.mjs";
import type { PublicBootstrap } from "@/contexts/PublicBootstrapContext";
export function isPublicHydration() {
  return typeof document !== "undefined" &&
    document.getElementById("root")?.getAttribute("data-gdg-ssr") === location.pathname + location.search;
}
export function readPublicBootstrap(): PublicBootstrap | undefined {
  if (!isPublicHydration()) return;
  try {
    const raw = JSON.parse(document.getElementById("gdg-public-bootstrap")?.textContent || "null");
    const status = readPublicSiteStatus(raw?.status);
    if (!status) return;
    return { status, home: readHomeContent(raw.home) };
  } catch { return; }
}
export function useInitialPictureSource(source: string) {
  const [initial] = useState(() => import.meta.env.SSR || isPublicHydration() ? source : undefined);
  return initial;
}
