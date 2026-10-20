export const teamGrantOptions = [
  {
    label: "Events",
    path: "/admin/events",
    resource: "events",
    extras: ["publish"],
  },
  {
    label: "Resources",
    path: "/admin/resources",
    resource: "resources",
    extras: ["publish"],
  },
  {
    label: "Sponsors",
    path: "/admin/sponsors",
    resource: "sponsors",
    extras: ["publish"],
  },
  {
    label: "Public team profiles",
    path: "/admin/team",
    resource: "team_members",
    extras: ["publish"],
  },
  {
    label: "Site content",
    path: "/admin/content",
    resource: "site_content",
    extras: ["publish"],
  },
  {
    label: "Forms",
    path: "/admin/forms",
    resource: "forms",
    extras: [
      "publish",
      "manage_access",
      "view_responses",
      "view_sensitive_responses",
      "export_responses",
    ],
  },
  { label: "Members", path: "/admin/members", resource: "members", extras: [] },
  {
    label: "Newsletter",
    path: "/admin/newsletter",
    resource: "newsletter",
    extras: ["send_email"],
  },
  { label: "Media", path: "/admin/media", resource: "media", extras: [] },
  {
    label: "Gallery",
    path: "/admin/gallery",
    resource: "gallery",
    extras: ["publish"],
  },
  {
    label: "Linktree",
    path: "/admin/linktree",
    resource: "linktree",
    extras: ["publish"],
  },
  {
    label: "Communications",
    path: "/admin/communications",
    resource: "communications",
    extras: [],
  },
  {
    label: "Whiteboards",
    path: "/admin/whiteboard",
    resource: "whiteboards",
    extras: [],
  },
  {
    label: "Finances",
    path: "/admin/finances",
    resource: "finances",
    extras: [],
  },
  {
    label: "Private blog",
    path: "/admin/blog",
    resource: "blog",
    extras: ["publish"],
  },
  {
    label: "Private projects",
    path: "/admin/projects",
    resource: "projects",
    extras: ["publish"],
  },
] as const;
export type TeamGrant = {
  path: string;
  resource: string;
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  extras: string[];
};
