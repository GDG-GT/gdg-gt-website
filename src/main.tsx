import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/gt.css";
import "./styles/media.css";
import "./styles/newsletter.css";
import "./styles/contact-inbox.css";
import { registerPublicWorker } from "./pwa/register";
// import { SpeedInsights } from "@vercel/speed-insights/react";

void registerPublicWorker();
// Route components own the live graph after React starts; the initial graph
// remains available in raw HTML without duplicating Event/Organization data.
document
  .querySelectorAll("script[data-gdg-document]")
  .forEach((node) => node.remove());

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {/* <SpeedInsights /> */}
  </>,
);
