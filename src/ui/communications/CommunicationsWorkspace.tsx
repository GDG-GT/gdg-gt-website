import { WorkspaceLoading } from "@/contexts/WorkspaceReadinessContext";
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
const Tasks = lazy(() => import("../tasks/TaskWorkspace"));
const Messages = lazy(() => import("./DirectMessageWorkspace"));
const Announcements = lazy(() => import("./AnnouncementWorkspace"));
const ContactInbox = lazy(() => import("./ContactInbox"));
export default function CommunicationsWorkspace() {
  const [params] = useSearchParams();
  return (
    <Suspense
      fallback={
        <WorkspaceLoading>Loading communications…</WorkspaceLoading>
      }
    >
      {params.get("tab") === "contact" ? (
        <ContactInbox />
      ) : params.get("tab") === "announcements" ? (
        <Announcements />
      ) : params.get("tab") === "messages" ? (
        <Messages />
      ) : (
        <Tasks />
      )}
    </Suspense>
  );
}
