import "../lib/validation-runtime";
import { createRoot } from "react-dom/client";
import SubmissionQueue, { QueueRuntime } from "./SubmissionQueue";
import "../index.css";
import "../styles/gt.css";
export function OfflinePage() {
  return <main className="gt-offline-document"><header><img src="/logo.png" width="48" height="30" alt="GDG at Georgia Tech" /><h1>You’re offline.</h1></header>
    <p>Public app assets and this help page are available offline. Current event information, private workspace data and native forms are not cached.</p>
    <p>No registration or final form response is confirmed without an online server commit. Pending public submissions below belong only to this device.</p>
    <SubmissionQueue /><QueueRuntime />
    <details><summary>Install and reconnect</summary><p>Chrome/Edge: use Install app in the browser menu. iPhone/iPad: Safari → Share → Add to Home Screen. Installation does not enable notifications.</p></details>
    <nav aria-label="Reconnect"><a href="/">Try the home page</a><a href="/events">Try events</a><a href="/offline">Refresh pending submissions</a></nav>
  </main>;
}
createRoot(document.getElementById("offline-root")!).render(<OfflinePage />);
