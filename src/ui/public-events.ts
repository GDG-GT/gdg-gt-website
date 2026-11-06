import { useContent } from "@/contexts/ContentContext";
import { eventForPage, type ChapterEvent } from "./events";
import type { EventRecord } from "@/lib/chapter-types";
import { localPreviewEnabled } from "./preview-data";
import { usePublicCollection } from "./public-collections";
import { usePublicMetadata } from "./usePublicMetadata";

export type SiteEvent = EventRecord & {
  slug?: string;
  publication_status?: string;
  end_at?: string | null;
  status?: string;
  accurate_attendee_count?: number;
  linked_forms?: ChapterEvent["linked_forms"];
};
export const slugFor = (event: SiteEvent) =>
  event.slug ||
  event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const isPast = (event: SiteEvent) =>
  new Date(event.end_at || event.date).getTime() < Date.now();
export const safePublicUrl = (value?: string) => {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
export const levelLabel = (level?: string) =>
  ({
    beginner: "Beginner friendly",
    intermediate: "Intermediate",
    advanced: "Advanced",
    open_for_all: "Everyone welcome",
  })[level || ""] || "Everyone welcome";
export function useEvents() {
  const listing = usePublicCollection<ChapterEvent>(
    `/events?status=${localPreviewEnabled ? "all" : "upcoming"}&sort=soonest&pageSize=3`,
  );
  return {
    events: (listing.data?.items || []).map(eventForPage),
    loading: listing.loading,
    error: listing.error,
    at: listing.at,
    retry: listing.retry,
  };
}
export function usePageTitle(
  title: string,
  description?: string,
  image?: string,
) {
  const { getSiteSetting } = useContent(),
    siteTitle = String(getSiteSetting("site_title") || "GDG at Georgia Tech");
  usePublicMetadata(`${title} · ${siteTitle}`, { description, image });
}
