import { Field } from "../primitives";
import BlogMarkdown from "./BlogMarkdown";
import { string, type Values } from "./fields";
export default function BlogFields({
  kind,
  values,
  change,
  categories,
}: {
  kind: string;
  values: Values;
  change: (key: string, value: unknown) => void;
  categories: { id: string; name: string }[];
}) {
  const inputs =
    kind === "posts"
      ? [
          ["title", "Title", 200],
          ["slug", "Private slug", 150],
          ["author_name", "Author name", 100],
          ["author_email", "Private author email", 254],
          ["featured_image_url", "Featured image URL (metadata only)", 2000],
          ["author_avatar_url", "Avatar URL (metadata only)", 2000],
        ]
      : [
          ["name", "Category name", 100],
          ["slug", "Category slug", 150],
          ["color", "Color", 7],
        ];
  return (
    <>
      <div className="gt-blog-fields">
        {inputs.map(([key, label, max]) => (
          <Field key={String(key)} label={String(label)}>
            <input
              value={string(values, String(key))}
              onChange={(e) => change(String(key), e.target.value)}
              maxLength={Number(max)}
              type={key === "author_email" ? "email" : "text"}
            />
          </Field>
        ))}
        {kind === "posts" && (
          <Field label="Category">
            <select
              value={String(values.category_id || "")}
              onChange={(e) => change("category_id", e.target.value || null)}
            >
              <option value="">Uncategorized</option>
              {!!values.category_id &&
                !categories.some((c) => c.id === values.category_id) && (
                  <option value={String(values.category_id)}>
                    Retained category
                  </option>
                )}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={kind === "posts" ? "Reading time (minutes)" : "Sort order"}
        >
          <input
            type="number"
            min={kind === "posts" ? 1 : 0}
            max={kind === "posts" ? 180 : 100000}
            value={
              Number(
                values[kind === "posts" ? "read_time_minutes" : "order_index"],
              ) || 0
            }
            onChange={(e) =>
              change(
                kind === "posts" ? "read_time_minutes" : "order_index",
                Number(e.target.value),
              )
            }
          />
        </Field>
      </div>
      {(kind === "posts"
        ? [
            ["excerpt", "Excerpt", 1000],
            ["content", "Article Markdown", 150000],
          ]
        : [["description", "Description", 2000]]
      ).map(([key, label, max]) => (
        <Field key={String(key)} label={String(label)}>
          <textarea
            rows={key === "content" ? 14 : 4}
            value={string(values, String(key))}
            maxLength={Number(max)}
            onChange={(e) => change(String(key), e.target.value)}
          />
        </Field>
      ))}
      {kind === "posts" && (
        <Field label="Tags (one per line)">
          <textarea
            rows={3}
            value={(Array.isArray(values.tags) ? values.tags : []).join("\n")}
            onChange={(e) => change("tags", e.target.value.split("\n"))}
            maxLength={2000}
          />
        </Field>
      )}
      <label className="gt-checkbox">
        <input
          type="checkbox"
          checked={!!values[kind === "posts" ? "is_featured" : "is_active"]}
          onChange={(e) =>
            change(
              kind === "posts" ? "is_featured" : "is_active",
              e.target.checked,
            )
          }
        />
        {kind === "posts" ? " Internally featured" : " Active taxonomy label"}
      </label>
      {kind === "posts" && (
        <details>
          <summary>Safe Markdown preview</summary>
          <BlogMarkdown>{string(values, "content")}</BlogMarkdown>
        </details>
      )}
    </>
  );
}
