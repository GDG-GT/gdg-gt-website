import "./lib/validation-runtime";
import { readPublicBootstrap } from "./ui/public-hydration";
import { PublicHydrationBoundary } from "./ui/PublicHydrationBoundary";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/public.generated.css";
import { registerPublicWorker } from "./pwa/register";
// import { SpeedInsights } from "@vercel/speed-insights/react";

void registerPublicWorker();
// Route components own the live graph after React starts; the initial graph
// remains available in raw HTML without duplicating Event/Organization data.
document
  .querySelectorAll("script[data-gdg-document]")
  .forEach((node) => node.remove());

const root = document.getElementById("root")!;
const bootstrap = readPublicBootstrap();
const application = <PublicHydrationBoundary><App bootstrap={bootstrap} /></PublicHydrationBoundary>;
if (bootstrap) hydrateRoot(root, application);
else createRoot(root).render(application);
