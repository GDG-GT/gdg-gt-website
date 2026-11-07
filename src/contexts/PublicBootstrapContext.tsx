import { createContext, useContext } from "react";
import type { HomeContent } from "@/lib/content-snapshot";
import type { SiteState } from "./SiteAvailabilityContext";
export type PublicBootstrap = { home: HomeContent; status: SiteState };
export const PublicBootstrapContext = createContext<PublicBootstrap | undefined>(undefined);
export const usePublicBootstrap = () => useContext(PublicBootstrapContext);
