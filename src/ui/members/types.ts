export type MemberFields = {
  name: string;
  email: string;
  phone: string;
  year: string;
  major: string;
  category: string;
  interests: string[];
  is_active: boolean;
  is_core_team: boolean;
  team_section: string;
};
export type Member = MemberFields & {
  id: string;
  reference: string;
  team_id: string | null;
  teamName: string | null;
  revision: number;
  deleted_at: string | null;
  merged_into_id: string | null;
  actions: string[];
  publicProfile: {
    id: string;
    revision: number;
    active: boolean;
    name: string;
  } | null;
  canSyncProfile: boolean;
  activeProjectCount: number;
};
export type Listing = {
  items: MemberSummary[];
  total: number;
  pageSize: number;
  stats: { active: number; core: number; categories: Record<string, number> };
};
export type MemberSummary = Omit<
  Member,
  "phone" | "year" | "major" | "interests"
>;
export type Capabilities = {
  globalCreate: boolean;
  merge: boolean;
  teams: { id: string; name: string }[];
};
export type Review = {
  reviewId: string;
  reviewToken: string;
  expiresAt: string;
  source: Member;
  target: Member;
  policy: string;
};
export type Activity = {
  items: { id: string; action: string; result: string; created_at: string }[];
  page: number;
  pageSize: number;
};
export type Mode =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "sync_profile"
  | "unmerge"
  | "merge"
  | null;
export const memberFields = (m?: Member): MemberFields => ({
  name: m?.name || "",
  email: m?.email || "",
  phone: m?.phone || "",
  year: m?.year || "",
  major: m?.major || "",
  category: m?.category || "member",
  interests: m?.interests || [],
  is_active: m?.is_active ?? true,
  is_core_team: m?.is_core_team || false,
  team_section: m?.team_section || "Active Members",
});
