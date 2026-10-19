import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { previewEvents, previewResources } from "../src/ui/preview-data";

// This adapter exists only in the Vite development server. It never ships in dist.
// Every record is fictional UI fixture data; no email or external service is used.
export function localPreview(): Plugin {
  const stamp = "2026-10-19T12:00:00.000Z";
  const record = <T extends Record<string, unknown>>(value: T) => ({
    id: randomUUID(),
    created_at: stamp,
    updated_at: stamp,
    ...value,
  });
  const navigation = [
    "Home",
    "Events",
    "Team",
    "Gallery",
    "Resources",
    "Sponsors",
    "Contact",
  ].map((label, i) =>
    record({
      label,
      href: i ? `/${label.toLowerCase()}` : "/",
      order_index: i,
      is_active: true,
    }),
  );
  const settings = {
    site_title: "GDG@GT",
    site_subtitle: "Local UI preview",
    logo_text: "G",
    admin_secret_code: "local-preview",
    site_description:
      "Google Developer Group on Campus at Georgia Institute of Technology",
  };
  const user = record({
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@example.test",
    display_name: "Local Preview",
    role: "super_admin",
    is_active: true,
  });
  const tables: Record<string, Record<string, unknown>[]> = {
    events: previewEvents,
    resources: previewResources.map((resource, order_index) =>
      record({
        ...resource,
        level: "Beginner",
        status: "Available",
        order_index,
      }),
    ),
    navigation_items: navigation,
    site_settings: Object.entries(settings).map(([key, value]) =>
      record({ key, value }),
    ),
    site_status: [
      record({
        is_live: true,
        redirect_url: "",
        message: "",
        auto_redirect: false,
      }),
    ],
    admin_users: [user],
    page_content: [
      record({
        page_slug: "home",
        section_key: "hero",
        is_active: true,
        order_index: 0,
        content: {
          title: "Google Developer Groups",
          subtitle: "at Georgia Tech",
          description:
            "Building the future together at Georgia Tech. This is the original application running with local sample data.",
          primary_cta_text: "Upcoming Events",
          primary_cta_link: "/events",
          secondary_cta_text: "Join Us",
          secondary_cta_link: "/contact",
        },
      }),
      record({
        page_slug: "home",
        section_key: "events",
        is_active: true,
        order_index: 1,
        content: {
          title: "Upcoming Events",
          description:
            "Chapter workshops, community gatherings, and opportunities to build.",
        },
      }),
    ],
    footer_content: [
      record({
        section_key: "description",
        content:
          "A student-led community at Georgia Tech. We learn, build, and grow together.",
        is_active: true,
        order_index: 0,
      }),
      record({
        section_key: "newsletter",
        content: {
          title: "Stay in the loop",
          description: "Get the latest chapter updates.",
        },
        is_active: true,
        order_index: 1,
      }),
      record({
        section_key: "quick_links",
        content: {
          links: navigation.map((item) => ({
            label: item.label,
            text: item.label,
            href: item.href,
            url: item.href,
          })),
        },
        is_active: true,
        order_index: 2,
      }),
    ],
  };
  const files = new Map<string, { bytes: Buffer; type: string }>();
  return {
    name: "local-ui-preview",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (
          !url.pathname.startsWith("/__local/supabase/") &&
          !["/api/session", "/api/csrf"].includes(url.pathname)
        )
          return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        const json = (value: unknown, status = 200) => {
          res.statusCode = status;
          res.end(JSON.stringify(value));
        };
        if (req.method === "OPTIONS") return json({});
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const part of req) {
          const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
          size += chunk.length;
          if (size > 51 * 1024 * 1024)
            return json(
              { message: "Local preview files must be under 50 MB." },
              413,
            );
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (url.pathname.includes("/storage/v1/")) {
          const resource = url.pathname.split("/storage/v1/")[1];
          if (
            resource.startsWith("object/") &&
            ["GET", "HEAD"].includes(req.method || "")
          ) {
            const path = decodeURIComponent(
              resource.replace(
                /^object\/(public\/|sign\/|authenticated\/)?/,
                "",
              ),
            );
            const file = files.get(path);
            if (!file)
              return json(
                {
                  message:
                    "Local file is no longer available. Upload it again.",
                },
                404,
              );
            res.setHeader("Content-Type", file.type);
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("Content-Security-Policy", "sandbox");
            if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))
              res.setHeader("Content-Disposition", "attachment");
            return res.end(req.method === "HEAD" ? undefined : file.bytes);
          }
          if (
            /^object\/(?!list\/|sign\/)/.test(resource) &&
            ["POST", "PUT"].includes(req.method || "")
          ) {
            const path = decodeURIComponent(resource.slice(7));
            let fileBytes = bytes,
              type = req.headers["content-type"] || "application/octet-stream";
            if (type.startsWith("multipart/form-data")) {
              const data = await new Request("http://localhost/", {
                method: "POST",
                headers: { "Content-Type": type },
                body: new Uint8Array(bytes),
              }).formData();
              const file = [...data.values()].find(
                (value) => typeof value !== "string",
              );
              if (!file || typeof file === "string")
                return json({ message: "No local file was selected." }, 400);
              fileBytes = Buffer.from(await file.arrayBuffer());
              type = file.type;
            }
            files.set(path, { bytes: fileBytes, type });
            return json({ Key: path, Id: randomUUID() });
          }
          if (resource.startsWith("object/sign/"))
            return json({ signedURL: `/object/public/${resource.slice(12)}` });
          if (resource.startsWith("object/list/")) return json([]);
          return json({
            name: resource.split("/").pop(),
            public: false,
            message: "Local preview only",
          });
        }
        const raw = bytes.toString("utf8");
        let body: Record<string, unknown> | Record<string, unknown>[] = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return json({ message: "Invalid JSON" }, 400);
        }
        if (url.pathname === "/api/csrf")
          return json({ csrfToken: "local-ui-preview-only" });
        if (url.pathname === "/api/session") {
          if (req.method === "POST") {
            const credentials = body as Record<string, unknown>;
            if (
              credentials.email !== "admin@example.test" ||
              credentials.password !== "local-preview"
            )
              return json(
                { error: "Use the documented local preview credentials." },
                401,
              );
            res.setHeader(
              "Set-Cookie",
              "gdg_local_preview=1; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800",
            );
            return json({ success: true, admin: user });
          }
          if (req.method === "DELETE") {
            res.setHeader(
              "Set-Cookie",
              "gdg_local_preview=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            );
            return json({ success: true });
          }
          return req.headers.cookie
            ?.split(";")
            .some((cookie) => cookie.trim() === "gdg_local_preview=1")
            ? json({ valid: true, admin: user })
            : json({ error: "No local preview session" }, 401);
        }
        const parts = url.pathname.split("/").filter(Boolean);
        const marker = parts.indexOf("v1");
        const table = parts[marker + 1];
        if (parts.includes("rpc")) {
          const rpc = parts[parts.length - 1];
          if (rpc === "authenticate_admin")
            return json([{ ...user, admin_id: user.id, success: true }]);
          if (rpc.includes("permission") || rpc.includes("access"))
            return json(true);
          if (rpc.includes("statistics") || rpc.includes("stats"))
            return json({});
          return json([]);
        }
        if (!url.pathname.includes("/rest/v1/"))
          return json({
            success: true,
            message: "Local preview only; no external action was performed.",
          });
        const source = (tables[table] ||= []);
        const matches = (row: Record<string, unknown>) =>
          [...url.searchParams].every(([key, value]) => {
            if (
              [
                "select",
                "order",
                "limit",
                "offset",
                "or",
                "on_conflict",
              ].includes(key)
            )
              return true;
            const dot = value.indexOf(".");
            const op = value.slice(0, dot),
              target = value.slice(dot + 1);
            if (op === "eq") return String(row[key]) === target;
            if (op === "neq") return String(row[key]) !== target;
            if (op === "is")
              return target === "null"
                ? row[key] == null
                : String(row[key]) === target;
            if (op === "in")
              return target
                .replace(/[()]/g, "")
                .split(",")
                .includes(String(row[key]));
            if (op === "gte") return String(row[key]) >= target;
            if (op === "lte") return String(row[key]) <= target;
            if (op === "lt") return String(row[key]) < target;
            if (op === "gt") return String(row[key]) > target;
            return true;
          });
        let result = source.filter(matches);
        if (req.method === "POST") {
          result = (Array.isArray(body) ? body : [body]).map((item) =>
            record(item),
          );
          source.push(...result);
        } else if (req.method === "PATCH") {
          for (const row of result)
            Object.assign(row, body, { updated_at: new Date().toISOString() });
        } else if (req.method === "DELETE") {
          tables[table] = source.filter((row) => !matches(row));
        }
        const order = url.searchParams.get("order");
        if (order) {
          const [key, direction] = order.split(".");
          result.sort(
            (a, b) =>
              String(a[key] ?? "").localeCompare(String(b[key] ?? "")) *
              (direction === "desc" ? -1 : 1),
          );
        }
        const count = result.length;
        const offset = Number(url.searchParams.get("offset") || 0);
        result = result.slice(
          offset,
          offset + Number(url.searchParams.get("limit") || count || 1),
        );
        res.setHeader(
          "Content-Range",
          `0-${Math.max(0, result.length - 1)}/${count}`,
        );
        if (req.headers.accept?.includes("application/vnd.pgrst.object+json"))
          return json(result[0] ?? null);
        return json(result);
      });
    },
  };
}
