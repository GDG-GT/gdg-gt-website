import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/gt.css";
import { registerPublicWorker } from "./pwa/register";
// import { SpeedInsights } from "@vercel/speed-insights/react";

void registerPublicWorker();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {/* <SpeedInsights /> */}
  </>
);
