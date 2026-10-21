import { api, clearApiSession, ApiFailure } from "@/lib/api";
import type { AdminUser } from "@/lib/supabase";
import { publicQueue } from "../../shared/public-queue.mjs";
export default class SessionService {
  static async login(credentials: {
    email: string;
    password: string;
  }): Promise<AdminUser | null> {
    const result = await api<{ user: AdminUser; csrfToken: string }>(
      "/auth/login",
      { method: "POST", body: credentials },
    );
    return result.user;
  }
  static async validateSession(): Promise<AdminUser | null> {
    try {
      return (
        await api<{ user: AdminUser; csrfToken: string }>("/auth/session")
      ).user;
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) return null;
      throw error;
    }
  }
  static async logout(): Promise<boolean> {
    await api("/auth/session", { method: "DELETE", protected: true });
    // Clear before resolving sign-out; the database epoch fences an in-flight
    // replay result from restoring a discarded entry. A sent request cannot be recalled.
    await publicQueue.clear().catch(() => window.dispatchEvent(new Event("gdg:queue-clear-failed")));
    window.dispatchEvent(new Event("gdg:queue-changed"));
    clearApiSession();
    return true;
  }
}
