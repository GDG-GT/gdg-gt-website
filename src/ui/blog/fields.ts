export const postDefaults = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  author_name: "Chapter contributor",
  author_email: "",
  featured_image_url: "",
  author_avatar_url: "",
  category_id: null as string | null,
  tags: [] as string[],
  read_time_minutes: 5,
  is_featured: false,
};
export const categoryDefaults = {
  name: "",
  slug: "",
  description: "",
  color: "#c4473b",
  is_active: true,
  order_index: 0,
};
export type Values = Record<string, unknown>;
export const string = (r: Values | undefined, key: string) =>
  typeof r?.[key] === "string" ? String(r[key]) : "";
export function initialValues(kind: string, record?: Values): Values {
  return Object.fromEntries(
    Object.entries(kind === "posts" ? postDefaults : categoryDefaults).map(
      ([k, v]) => [k, record?.[k] ?? v],
    ),
  );
}
