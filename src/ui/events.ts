export type ChapterEvent = {
  id: string;
  title: string;
  slug: string;
  description: string;
  short_description: string;
  start_at: string;
  end_at: string | null;
  timezone: string;
  location: string;
  room?: string;
  type: string;
  level: "beginner" | "intermediate" | "advanced" | "open_for_all";
  image_url?: string;
  registration_url?: string;
  google_form_url?: string;
  google_event_url?: string;
  event_link?: string;
  image_media_id?: string;
  registration_type: "internal" | "external" | "both";
  registration_enabled: boolean;
  registration_state?: "open" | "closed" | "ended" | "full";
  linked_forms?: { label: string; href: string }[];
  publication_status: "draft" | "published" | "cancelled" | "archived";
  max_participants: number | null;
  external_attendees: number;
  is_featured: boolean;
  team_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  prerequisites?: string;
  what_youll_learn?: string;
  what_to_bring?: string;
  schedule?: string;
  additional_info?: string;
  contact_info?: string;
};
export const eventDateLabel = (value: string, timezone = "America/New_York") =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
export const eventTimeLabel = (value: string, timezone = "America/New_York") =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
export const eventForPage = (event: ChapterEvent) => ({
  ...event,
  date: event.start_at,
  status: event.publication_status,
  time: eventTimeLabel(event.start_at, event.timezone),
});
