import type { ManagedLink, PageCopy } from "../../shared/site-content";
import type { PublicMetric } from "@/ui/public-collections";

export type FooterCopy = Partial<
  Record<
    | "title"
    | "description"
    | "newsletter_title"
    | "newsletter_description"
    | "copyright",
    string
  >
>;
export type ContentSnapshot = {
  settings: { key: string; value: unknown }[];
  pages: { page_slug: string; section_key: string; content: PageCopy }[];
  navigation: { id?: string; label: string; href: string }[];
  social: { platform: string; url: string }[];
  footer: { section_key: string; content: FooterCopy }[];
};
export type HomeContent = ContentSnapshot & { metrics: PublicMetric[] };

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function readHomeContent(value: unknown): HomeContent {
  const unreadable = () => {
    throw new Error(
      "Chapter updates returned an unreadable response. Please try again.",
    );
  };
  if (!record(value)) return unreadable();
  const fields = {
    settings: ["key"],
    pages: ["page_slug", "section_key"],
    navigation: ["label", "href"],
    social: ["platform", "url"],
    footer: ["section_key"],
    metrics: ["id", "stat_label", "stat_value", "stat_description"],
  };
  for (const [collection, required] of Object.entries(fields)) {
    const rows = value[collection];
    if (
      !Array.isArray(rows) ||
      rows.length > 10000 ||
      rows.some(
        (row: unknown) =>
          !record(row) ||
          required.some((key) => typeof row[key] !== "string") ||
          (["pages", "footer"].includes(collection) &&
            (!record(row.content) ||
              Object.values(row.content).some(
                (copy) => typeof copy !== "string",
              ))),
      )
    )
      return unreadable();
  }
  return value as HomeContent;
}

export function projectContent(snapshot: ContentSnapshot) {
  const settings: Record<string, unknown> = Object.fromEntries(
    snapshot.settings.map((row) => [row.key, row.value]),
  );
  const pages: Record<string, Record<string, PageCopy>> = Object.create(null);
  for (const row of snapshot.pages) {
    // Null-prototype maps keep even a malformed legacy slug from resolving
    // inherited object properties. Server validation remains authoritative.
    if (!pages[row.page_slug]) pages[row.page_slug] = Object.create(null);
    pages[row.page_slug][row.section_key] = row.content;
  }
  const footer: Record<string, FooterCopy> = Object.fromEntries(
    snapshot.footer.map((row) => [row.section_key, row.content]),
  );
  return { settings, pages, footer };
}
export function managedLinks(
  settings: Record<string, unknown>,
  category?: string,
): ManagedLink[] {
  const value = settings.all_links;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ManagedLink =>
      !!row &&
      typeof row === "object" &&
      ["id", "name", "url", "category"].every(
        (key) => typeof row[key] === "string",
      ) &&
      (!category || row.category === category),
  );
}
export function managedLink(settings: Record<string, unknown>, key: string) {
  const configured = settings[key + "_url"];
  return (
    managedLinks(settings).find(
      (item) =>
        item.id === key || item.name.toLowerCase().replace(/\s+/g, "_") === key,
    )?.url || (typeof configured === "string" ? configured : "#")
  );
}
