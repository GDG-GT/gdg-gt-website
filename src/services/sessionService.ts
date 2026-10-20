import { api, clearApiSession, ApiFailure } from "@/lib/api";
import type { AdminUser } from "@/lib/supabase";
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
    clearApiSession();
    return true;
  }
}
