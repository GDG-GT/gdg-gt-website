import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
const Tasks = lazy(() => import("./tasks/TaskWorkspace"));
const Messages = lazy(() => import("./communications/DirectMessageWorkspace"));
export default function PersonalWork({
  view,
  editorial = false,
}: {
  view: "tasks" | "messages";
  editorial?: boolean;
}) {
  const base = editorial ? "/admin/blog-editor" : "/admin";
  return (
    <>
      <nav
        aria-label="Your workspace"
        className="gt-admin-page gt-workspace-tabs"
      >
        <Link className="gt-button gt-button-secondary" to={base}>
          Back to {editorial ? "writing" : "overview"}
        </Link>
        <Link
          className="gt-button gt-button-secondary"
          aria-current={view === "tasks" ? "page" : undefined}
          to={base + "?view=tasks"}
        >
          Your tasks
        </Link>
        <Link
          className="gt-button gt-button-secondary"
          aria-current={view === "messages" ? "page" : undefined}
          to={base + "?view=messages"}
        >
          Your messages
        </Link>
      </nav>
      <Suspense fallback={<p role="status">Loading your {view}…</p>}>
        {view === "tasks" ? <Tasks personal /> : <Messages personal />}
      </Suspense>
    </>
  );
}
