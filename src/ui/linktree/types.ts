export type Background =
  | { type: "color"; value: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; value: string };
export type ProfileFields = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  background: Background;
  theme: "light" | "dark" | "auto";
};
export type Profile = ProfileFields & {
  id: string;
  active: boolean;
  deletedAt: string | null;
  teamId: string | null;
  teamName: string | null;
  revision: number;
  actions: string[];
};
export type LinkFields = {
  title: string;
  url: string;
  description: string;
  icon: string;
  buttonStyle: string;
  buttonColor: string;
  textColor: string;
  embedType: string;
  showClickCount: boolean;
};
export type ProfileLink = LinkFields & {
  id: string;
  active: boolean;
  deletedAt: string | null;
  order: number;
  clickCount: string | null;
  embedUrl?: string | null;
};
export type Detail = {
  profile: Profile;
  links: ProfileLink[];
  linkTotal: number;
  linkPageSize: number;
};
export type Capabilities = {
  globalCreate: boolean;
  teams: { id: string; name: string }[];
};
export type Listing = { items: Profile[]; total: number; pageSize: number };
export type Analytics = {
  views: string;
  clicks: string;
  lifetimeViews: string;
  days: { day: string; views: string; clicks: string }[];
  links: { link_id: string; title: string; clicks: string }[];
  note: string;
};
export const countLabel = (v: string | null) =>
  /^\d+$/.test(v || "") ? BigInt(v!).toLocaleString() : "0";
export const profileFields = (p?: Profile): ProfileFields => ({
  username: p?.username || "",
  displayName: p?.displayName || "",
  bio: p?.bio || "",
  avatarUrl: p?.avatarUrl || "",
  background: p?.background || { type: "color", value: "#f8d8c6" },
  theme: p?.theme || "light",
});
export const linkFields = (l?: ProfileLink): LinkFields => ({
  title: l?.title || "",
  url: l?.url || "",
  description: l?.description || "",
  icon: l?.icon || "link",
  buttonStyle: l?.buttonStyle || "default",
  buttonColor: l?.buttonColor || "#f4f5f7",
  textColor: l?.textColor || "#25282f",
  embedType: l?.embedType || "none",
  showClickCount: l?.showClickCount || false,
});
