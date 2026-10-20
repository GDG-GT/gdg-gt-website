import { api } from "@/lib/api";
export interface SiteStatus {
  id: string;
  is_live: boolean;
  redirect_url: string;
  message?: string;
  button_text?: string;
  auto_redirect?: boolean;
  created_at: string;
  updated_at: string;
}
export class SiteStatusService {
  static async getSiteStatus(): Promise<SiteStatus | null> {
    return api<SiteStatus>("/site-status");
  }
  static async updateSiteStatus(
    updates: Partial<SiteStatus>,
  ): Promise<SiteStatus | null> {
    return api<SiteStatus>("/admin/site-status", {
      method: "PATCH",
      protected: true,
      body: updates,
    });
  }
  static async shouldRedirect(path: string) {
    if (
      path.startsWith("/l/") ||
      path.startsWith("/admin") ||
      ["/offline", "/maintenance"].includes(path)
    )
      return { shouldRedirect: false };
    const result = await this.getSiteStatus();
    return {
      shouldRedirect: result?.is_live === false,
      message: result?.message,
      redirectUrl: undefined as string | undefined,
    };
  }
  static async isSiteLive() {
    return (await this.getSiteStatus())?.is_live ?? true;
  }
  static clearCache() {}
}
