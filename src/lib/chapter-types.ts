// Publicly serialized application types. Authentication secrets and database
// clients belong to the server or the dedicated scoped Realtime transport.
export interface AdminUser {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "team_member" | "blog_editor";
  display_name?: string;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  last_login?: string;
}
export interface AdminTeam {
  id: string;
  name: string;
  description?: string;
  slug: string;
  team_lead_id?: string;
  color: string;
  icon: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  team_lead?: { id: string; email: string; display_name?: string };
  member_count?: number;
}
export interface TeamMembership {
  id: string;
  team_id: string;
  admin_user_id: string;
  role: "lead" | "co_lead" | "member";
  joined_at: string;
  added_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  admin_user?: {
    id: string;
    email: string;
    display_name?: string;
    role: string;
  };
  team?: AdminTeam;
}
export interface MergedProfile {
  adminId: string;
  email: string;
  role: AdminUser["role"];
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  teamMember?: {
    id: string;
    name: string;
    teamRole: string;
    bio?: string;
    imageUrl?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    orderIndex: number;
    isActive: boolean;
  };
  displayName: string;
  hasTeamProfile: boolean;
  profileComplete: boolean;
}
export interface EventRecord {
  id: string;
  title: string;
  description: string;
  short_description?: string;
  date: string;
  previous_start_at?: string | null;
  location: string;
  image_url?: string;
  registration_url?: string;
  google_form_url?: string;
  google_event_url?: string;
  registration_type?: "external" | "internal" | "both";
  max_participants?: number | null;
  registration_enabled?: boolean;
  registration_state?: "open" | "closed" | "ended" | "full";
  is_featured: boolean;
  level?: "beginner" | "intermediate" | "advanced" | "open_for_all";
  external_attendees?: number;
  timezone?: string;
  event_link?: string;
  type?: string;
  time?: string;
  room?: string;
  prerequisites?: string;
  what_youll_learn?: string;
  what_to_bring?: string;
  schedule?: string;
  additional_info?: string;
  contact_info?: string;
  created_at: string;
  updated_at: string;
}
