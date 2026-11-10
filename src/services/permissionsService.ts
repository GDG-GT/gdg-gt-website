import type { AdminUser } from "@/lib/chapter-types";
import { api } from "@/lib/api";
// Permission resource types
export type ResourceType =
  | "events"
  | "projects"
  | "blog"
  | "members"
  | "team_members"
  | "sponsors"
  | "newsletter"
  | "media"
  | "site_content"
  | "communications"
  | "finances"
  | "admin_users"
  | "admin_teams"
  | "outreach";

// Permission actions
export type PermissionAction = "create" | "read" | "update" | "delete";

// Admin page access mapping
export const PAGE_PERMISSIONS: Record<
  string,
  { resource: ResourceType; action: PermissionAction }[]
> = {
  "/admin": [], // Dashboard - accessible to all authenticated admins
  "/admin/events": [{ resource: "events", action: "read" }],
  "/admin/projects": [{ resource: "projects", action: "read" }],
  "/admin/blog": [{ resource: "blog", action: "read" }],
  "/admin/members": [{ resource: "members", action: "read" }],
  "/admin/team": [{ resource: "team_members", action: "read" }],
  "/admin/sponsors": [{ resource: "sponsors", action: "read" }],
  "/admin/newsletter": [{ resource: "newsletter", action: "read" }],
  "/admin/media": [{ resource: "media", action: "read" }],
  "/admin/content": [{ resource: "site_content", action: "read" }],
  "/admin/communications": [{ resource: "communications", action: "read" }],
  "/admin/finances": [{ resource: "finances", action: "read" }],
  "/admin/users": [{ resource: "admin_users", action: "read" }],
  "/admin/teams": [{ resource: "admin_teams", action: "read" }],
  "/admin/linktree": [{ resource: "site_content", action: "read" }],
  "/admin/resources": [{ resource: "site_content", action: "read" }],
  "/admin/site-status": [{ resource: "site_content", action: "update" }],
  "/admin/notifications": [],
  "/admin/profile": [], // Profile - accessible to all authenticated admins
  "/admin/guide": [], // Guide - accessible to all authenticated admins
  "/admin/channels": [], // Org-wide channels - accessible to all authenticated admins
  "/admin/whiteboard": [], // Collaborative whiteboard - accessible to all authenticated admins
  "/admin/gallery": [], // Photo gallery management - accessible to all authenticated admins
};

const aliases: Record<string, string> = {
  team_members: "team_profiles",
  site_content: "content",
  admin_teams: "teams",
  admin_users: "users",
};
// Legacy dashboard display compatibility; never infer permissions from a slug.
export const TEAM_PAGE_ACCESS: Record<string, string[]> = {};
// UI affordances only. Each operation is authorized again by its server endpoint.
export class PermissionsService {
  static async hasPermission(
    user: AdminUser | null,
    resource: ResourceType,
    action: PermissionAction,
  ) {
    if (!user) return false;
    const route =
      Object.entries(PAGE_PERMISSIONS).find(([, perms]) =>
        perms.some((p) => p.resource === resource),
      )?.[0] || "/admin";
    try {
      return (
        await api<{ allowed: boolean }>(
          "/admin/access?" +
            new URLSearchParams({
              resource: aliases[resource] || resource,
              action,
              route,
            }),
        )
      ).allowed;
    } catch {
      return false;
    }
  }
  static async canAccessPage(
    user: AdminUser | null,
    path: string,
    signal?: AbortSignal,
  ) {
    if (!user) return false;
    return (
      await api<{ allowed: boolean }>(
        "/admin/access?route=" + encodeURIComponent(path),
        { signal },
      )
    ).allowed;
  }
  static async getAccessiblePages(
    user: AdminUser | null,
    signal?: AbortSignal,
  ) {
    if (!user) return [];
    return (await api<{ accessibleRoutes: string[] }>("/admin/access", { signal }))
      .accessibleRoutes;
  }
  static canManageUser(actor: AdminUser | null, target: AdminUser) {
    return (
      !!actor &&
      actor.id !== target.id &&
      (actor.role === "super_admin" ||
        (actor.role === "admin" &&
          ["team_member", "blog_editor"].includes(target.role)))
    );
  }
  static getAssignableRoles(user: AdminUser | null) {
    return user?.role === "super_admin"
      ? ["super_admin", "admin", "team_member", "blog_editor"]
      : user?.role === "admin"
        ? ["team_member", "blog_editor"]
        : [];
  }
  static canCreateAdminUsers(user: AdminUser | null) {
    return !!user && ["super_admin", "admin"].includes(user.role);
  }
  static canCreateTeams(user: AdminUser | null) {
    return !!user && ["super_admin", "admin"].includes(user.role);
  }
  static canDeleteTeams(user: AdminUser | null) {
    return this.canCreateTeams(user);
  }
  static canEditTeamSettings(user: AdminUser | null) {
    return this.canCreateTeams(user);
  }
  static async isTeamLead(userId: string) {
    const result = await api<{
      user: AdminUser;
      memberships: { role: string }[];
    }>("/admin/me");
    return (
      result.user.id === userId &&
      result.memberships.some((m) => ["lead", "co_lead"].includes(m.role))
    );
  }
  static async isTeamLeadOf(userId: string, teamId: string) {
    const result = await api<{
      user: AdminUser;
      memberships: { role: string; team_id: string }[];
    }>("/admin/me");
    return (
      result.user.id === userId &&
      result.memberships.some(
        (m) => m.team_id === teamId && ["lead", "co_lead"].includes(m.role),
      )
    );
  }
  static getRoleDisplayName(role: string) {
    return (
      (
        {
          super_admin: "Super Admin",
          admin: "Admin",
          team_member: "Team Member",
          blog_editor: "Blog Editor",
          lead: "Team Lead",
          co_lead: "Co-Lead",
          member: "Member",
        } as Record<string, string>
      )[role] || role
    );
  }
  static getRoleBadgeColor(role: string) {
    return (
      (
        {
          super_admin: "bg-red-100 text-red-800",
          admin: "bg-blue-100 text-blue-800",
          team_member: "bg-green-100 text-green-800",
          blog_editor: "bg-purple-100 text-purple-800",
          lead: "bg-orange-100 text-orange-800",
          co_lead: "bg-orange-100 text-orange-800",
        } as Record<string, string>
      )[role] || "bg-gray-100 text-gray-800"
    );
  }
  static async checkDatabasePageAccess(_userId: string, path: string) {
    return (
      await api<{ allowed: boolean }>(
        "/admin/access?route=" + encodeURIComponent(path),
      )
    ).allowed;
  }
  static async getTeamPageAccess(teamId: string) {
    return (
      await api<{ items: { page_path: string; can_access: boolean }[] }>(
        "/admin/teams/" + teamId + "/page-access",
      )
    ).items
      .filter((p) => p.can_access)
      .map((p) => p.page_path);
  }
  static async setTeamPageAccess(
    teamId: string,
    pagePath: string,
    canAccess: boolean,
  ) {
    await api("/admin/teams/" + teamId + "/page-access", {
      method: "PATCH",
      protected: true,
      body: { items: [{ path: pagePath, canAccess }] },
    });
    return true;
  }
  static async bulkSetTeamPageAccess(
    teamId: string,
    pageAccess: { path: string; canAccess: boolean }[],
  ) {
    await api("/admin/teams/" + teamId + "/page-access", {
      method: "PATCH",
      protected: true,
      body: { items: pageAccess },
    });
    return true;
  }
}
