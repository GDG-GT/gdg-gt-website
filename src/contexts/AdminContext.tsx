import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { api } from "@/lib/api";
import type {
  AdminUser,
  MergedProfile,
  AdminTeam,
  TeamMembership,
} from "@/lib/chapter-types";
import {
  PermissionsService,
  type ResourceType,
  type PermissionAction,
} from "@/services/permissionsService";
import SessionService from "@/services/sessionService";
interface Context {
  isAuthenticated: boolean;
  currentAdmin: AdminUser | null;
  mergedProfile: MergedProfile | null;
  userTeams: TeamMembership[];
  currentTeam: AdminTeam | null;
  setCurrentTeam: (value: AdminTeam | null) => void;
  refreshTeams: () => Promise<void>;
  hasPermission: (
    resource: ResourceType,
    action: PermissionAction,
  ) => Promise<boolean>;
  canAccessPage: (path: string) => Promise<boolean>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isTeamMember: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: {
    username: string;
    password: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retrySession: () => Promise<void>;
  updateTeamProfile: (data: {
    name: string;
    role: string;
    bio?: string;
    imageUrl?: string;
    linkedinUrl?: string;
    githubUrl?: string;
  }) => Promise<boolean>;
}
const AdminContext = createContext<Context | undefined>(undefined);
export const useAdmin = () => {
  const value = useContext(AdminContext);
  if (!value) throw new Error("AdminProvider is required.");
  return value;
};
type Me = {
  user: AdminUser;
  memberships: TeamMembership[];
  profile: null | {
    id: string;
    name: string;
    role: string;
    bio?: string;
    image_url?: string;
    linkedin_url?: string;
    github_url?: string;
    order_index: number;
    is_active: boolean;
  };
};
export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null),
    [mergedProfile, setMergedProfile] = useState<MergedProfile | null>(null);
  const [userTeams, setUserTeams] = useState<TeamMembership[]>([]),
    [currentTeam, setCurrentTeam] = useState<AdminTeam | null>(null);
  const [isLoading, setIsLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => {
      setCurrentAdmin(null);
      setMergedProfile(null);
      setUserTeams([]);
      setCurrentTeam(null);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  const load = useCallback(async () => {
    const result = await api<Me>("/admin/me");
    setCurrentAdmin(result.user);
    setUserTeams(result.memberships);
    setCurrentTeam(
      (previous) =>
        result.memberships.find((m) => m.team_id === previous?.id)?.team ||
        result.memberships[0]?.team ||
        null,
    );
    const p = result.profile,
      u = result.user;
    setMergedProfile({
      adminId: u.id,
      email: u.email,
      role: u.role,
      isActive: u.is_active,
      createdAt: u.created_at,
      displayName: p?.name || u.display_name || u.email,
      hasTeamProfile: !!p,
      profileComplete: !!p?.bio,
      ...(p
        ? {
            teamMember: {
              id: p.id,
              name: p.name,
              teamRole: p.role,
              bio: p.bio,
              imageUrl: p.image_url,
              linkedinUrl: p.linkedin_url,
              githubUrl: p.github_url,
              orderIndex: p.order_index,
              isActive: p.is_active,
            },
          }
        : {}),
    });
    setError(null);
  }, []);
  const retrySession = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await SessionService.validateSession();
      if (user) await load();
      else {
        setCurrentAdmin(null);
        setMergedProfile(null);
        setUserTeams([]);
        setCurrentTeam(null);
      }
    } catch {
      setError("Your workspace could not load. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    let live = true;
    SessionService.validateSession()
      .then(async (user) => {
        if (user && live) await load();
      })
      .catch(() => {
        if (live) setError("Your workspace could not load. Please try again.");
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [load]);
  const login = async (credentials: { username: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      await SessionService.login({
        email: credentials.username,
        password: credentials.password,
      });
      await load();
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "We couldn’t sign you in. Please try again.",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  const logout = async () => {
    await SessionService.logout();
    setCurrentAdmin(null);
    setMergedProfile(null);
    setUserTeams([]);
    setCurrentTeam(null);
    setError(null);
  };
  const updateTeamProfile = async (
    data: Parameters<Context["updateTeamProfile"]>[0],
  ) => {
    try {
      await api("/admin/me", {
        method: "PATCH",
        protected: true,
        body: { profile: data },
      });
      await load();
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your profile could not be saved.",
      );
      return false;
    }
  };
  return (
    <AdminContext.Provider
      value={{
        currentAdmin,
        mergedProfile,
        userTeams,
        currentTeam,
        setCurrentTeam,
        isLoading,
        error,
        isAuthenticated: !!currentAdmin,
        isSuperAdmin: currentAdmin?.role === "super_admin",
        isAdmin: ["super_admin", "admin"].includes(currentAdmin?.role || ""),
        isTeamMember: currentAdmin?.role === "team_member",
        login,
        logout,
        refreshProfile: load,
        retrySession,
        refreshTeams: load,
        updateTeamProfile,
        hasPermission: (resource, action) =>
          PermissionsService.hasPermission(currentAdmin, resource, action),
        canAccessPage: (path) =>
          PermissionsService.canAccessPage(currentAdmin, path),
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
