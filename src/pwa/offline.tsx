import "../lib/validation-runtime";
import { createRoot } from "react-dom/client";
import SubmissionQueue, { QueueRuntime } from "./SubmissionQueue";
import "../index.css";
import "../styles/gt.css";
export function OfflinePage() {
  return (
    <main className="gt-offline-document">
      <header>
        <img src="/logo.png" width="48" height="30" alt="GDG at Georgia Tech" />
        <h1>You’re offline.</h1>
      </header>
      <p>Reconnect to load current events, forms and your workspace.</p>
      <p>
        Submissions below are pending. Reconnect and check their status before
        submitting again.
      </p>
      <SubmissionQueue />
      <QueueRuntime />
      <nav aria-label="Reconnect">
        <a href="/">Try the home page</a>
        <a href="/events">Try events</a>
        <a href="/offline">Refresh pending submissions</a>
      </nav>
    </main>
  );
}
createRoot(document.getElementById("offline-root")!).render(<OfflinePage />);
