import type { Plugin, Rollup } from "vite";
import { fileURLToPath } from "node:url";

const publicPages = fileURLToPath(
  new URL("../src/ui/PublicPages.tsx", import.meta.url),
);

/** Resolve only the selected public route's existing static module graph. */
export function publicRouteModules(bundle: Rollup.OutputBundle) {
  const entry = Object.values(bundle).find(
    (item) => item.type === "chunk" && item.facadeModuleId === publicPages,
  );
  if (!entry) throw Error("Public route chunk missing from build.");
  const modules = new Set<string>();
  const visit = (name: string) => {
    if (modules.has(name)) return;
    if (!/^assets\/[A-Za-z0-9_.-]+\.js$/.test(name) || name.includes(".."))
      throw Error("Unsafe public route module path.");
    const chunk = bundle[name];
    if (!chunk || chunk.type !== "chunk")
      throw Error("Public route static dependency missing from build.");
    modules.add(name);
    for (const dependency of chunk.imports) visit(dependency);
  };
  visit(entry.fileName);
  return [...modules].map((name) => "/" + name);
}

export function publicRouteHints(): Plugin {
  return {
    name: "gdg-public-route-hints",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (
          !context.bundle ||
          !context.filename.replaceAll("\\", "/").endsWith("/index.html")
        )
          return html;
        const helper =
          /<script\b(?=[^>]*\bsrc="\/assets\/public-entry\.js")[^>]*>/g;
        if ([...html.matchAll(helper)].length !== 1)
          throw Error(
            "Public route hints require exactly one public entry helper.",
          );
        const modules = publicRouteModules(context.bundle);
        return html.replace(
          helper,
          (tag) =>
            tag.slice(0, -1) + ` data-public-modules="${modules.join(" ")}">`,
        );
      },
    },
  };
}
