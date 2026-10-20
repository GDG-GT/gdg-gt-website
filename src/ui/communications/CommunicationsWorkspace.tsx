import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
const Tasks = lazy(() => import("../tasks/TaskWorkspace"));
const Messages = lazy(() => import("./DirectMessageWorkspace"));
export default function CommunicationsWorkspace() {
  const [params] = useSearchParams();
  return (
    <Suspense
      fallback={
        <div className="gt-admin-page" role="status">
          Loading communications…
        </div>
      }
    >
      {params.get("tab") === "messages" ? <Messages /> : <Tasks />}
    </Suspense>
  );
}
