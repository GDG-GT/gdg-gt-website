import { createContext } from "react";
import type { AdminUser } from "@/lib/chapter-types";

export type WorkspaceAccessSnapshot = {
  actor: AdminUser;
  routes: string[];
};

// A session-memory UI snapshot only. Every data read and mutation still goes
// through the server's current session and resource authorization.
export const WorkspaceAccessContext = createContext<{
  snapshot?: WorkspaceAccessSnapshot;
  failed: boolean;
  retry: () => void;
} | null>(null);
