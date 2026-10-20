export const managedPublicPages = [
  "home",
  "events",
  "team",
  "resources",
  "sponsors",
  "gallery",
  "contact",
] as const;
export const managedPageSections = [
  "hero",
  "header",
  "main",
  "community",
  "mission",
  "events",
  "metrics",
] as const;
export const pageCopyFields = [
  "title",
  "accent",
  "subtitle",
  "description",
  "primary_cta_text",
  "primary_cta_link",
  "secondary_cta_text",
  "secondary_cta_link",
  "cta_text",
  "cta_link",
  "no_events_message",
  "form_title",
  "success_message",
  "closed_message",
] as const;
export const managedSettingKeys = [
  "site_title",
  "site_subtitle",
  "site_description",
  "contact_email",
  "all_links",
] as const;
export type PageCopy = Partial<Record<(typeof pageCopyFields)[number], string>>;
export type ManagedLink = {
  id: string;
  name: string;
  url: string;
  category: string;
};
export function publicPageSections(page: string): readonly string[] {
  return page === "home"
    ? ["hero", "events", "community", "mission"]
    : page === "contact"
      ? ["main"]
      : ["header"];
}
export function editablePageCopy(
  page: string,
  section: string,
): readonly string[] {
  if (page === "home" && section === "hero")
    return [
      "title",
      "description",
      "primary_cta_text",
      "primary_cta_link",
      "secondary_cta_text",
      "secondary_cta_link",
    ];
  if (page === "home")
    return [
      "title",
      "description",
      "cta_text",
      "cta_link",
      ...(section === "events" ? ["no_events_message"] : []),
    ];
  if (page === "contact")
    return ["title", "description", "form_title", "success_message"];
  return ["title", "accent", "description"];
}
