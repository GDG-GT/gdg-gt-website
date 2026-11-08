import {
  publicDescription,
  publicIndexPaths,
  publicMetadataPath,
} from "../shared/public-metadata.ts";
import { ApiError } from "./lib/http.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import {
  linktreeProfile,
  linktreeUsername,
  linktreeLink,
} from "../shared/linktree.mjs";
const names = {
  "/": "Build, Learn, Grow",
  "/events": "Events",
  "/team": "Team",
  "/resources": "Resources",
  "/sponsors": "Sponsors",
  "/gallery": "Gallery",
  "/contact": "Contact",
  "/privacy": "Privacy",
  "/accessibility": "Accessibility",
};
const protectedPaths =
  /^\/(?:admin(?:\/.*)?|account(?:\/.*)?|newsletter(?:\/.*)?|forms\/[a-z0-9-]+(?:\/(?:preview|edit))?|team\/join|offline|maintenance|linktree|links)$/;
const text = (value, max = 160) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
function image(value, origin) {
  try {
    const url = new URL(value || "/logo.png", origin);
    return (url.origin === origin || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : origin + "/logo.png";
  } catch {
    return origin + "/logo.png";
  }
}
export async function siteDocument({ db, config, pathname }) {
  if (
    typeof pathname !== "string" ||
    pathname.length > 2048 ||
    !pathname.startsWith("/") ||
    /[?#\\]/.test(pathname) ||
    Array.from(pathname).some((char) => char.codePointAt(0) <= 32)
  )
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid document path.");
  if (['/leaderboard','/leaderboard/member','/tap'].includes(pathname)) return {
    status:200,index:pathname==='/leaderboard',title:'Member points · GDG at Georgia Tech',heading:'Member points',description:'Contributions, chapter perks and the GDG at Georgia Tech member leaderboard.',canonical:(config.rewardsOrigin||config.origin)+pathname,image:config.origin+'/logo.png',links:[{href:'/leaderboard',label:'Leaderboard'}]
  };
  const path = publicMetadataPath(pathname),
    known = publicIndexPaths.includes(path),
    privatePage = protectedPaths.test(path),
    eventSlug = path.match(/^\/events\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1];
  const doc = {
    status: known || privatePage ? 200 : 404,
    index: known,
    title:
      (names[path] ? names[path] + " · " : "Page not found · ") +
      "GDG at Georgia Tech",
    heading: names[path] || "Page not found",
    description: known
      ? publicDescription(path)
      : "The page could not be found. Explore chapter events, resources and ways to get involved.",
    canonical: config.origin + path,
    image: config.origin + "/logo.png",
    links: publicIndexPaths.map((href) => ({
      href,
      label: href === "/" ? "Home" : names[href],
    })),
  };
  if (privatePage)
    return {
      ...doc,
      title: "Chapter workspace · GDG at Georgia Tech",
      heading: "Chapter workspace",
      description:
        "Open the application to continue this private chapter workflow.",
      links: [{ href: "/", label: "Chapter website" }],
    };
  const profileName = path.match(/^\/l\/([^/]+)$/)?.[1];
  if (profileName) {
    if (!linktreeUsername.safeParse(profileName).success) return doc;
    const profile = checked(
      await db.rpc("public_linktree_profile", { p_username: profileName }),
    );
    if (
      !profile ||
      !linktreeProfile.safeParse({
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio || "",
        avatarUrl: profile.avatarUrl || "",
        background: profile.background,
        theme: profile.theme,
      }).success
    )
      return doc;
    return {
      ...doc,
      status: 200,
      index: false,
      title: text(profile.displayName, 100) + " · GDG at Georgia Tech",
      heading: text(profile.displayName, 100),
      description: text(profile.bio) || "Public chapter links.",
      image: image(profile.avatarUrl, config.origin),
      links: (profile.links || []).flatMap((link) => {
        const parsed = linktreeLink.safeParse({
          title: link.title,
          url: link.url,
          description: link.description || "",
          icon: link.icon,
          buttonStyle: link.buttonStyle,
          buttonColor: link.buttonColor,
          textColor: link.textColor,
          embedType: link.embedType,
          showClickCount: link.showClickCount,
        });
        return parsed.success
          ? [{ href: parsed.data.url, label: parsed.data.title }]
          : [];
      }),
    };
  }
  if (eventSlug) {
    if (eventSlug.length > 150) return doc;
    let record = checked(
      await db
        .from("events")
        .select(
          "id,slug,title,short_description,description,start_at,end_at,previous_start_at,timezone,location,room,image_url,event_link,publication_status",
        )
        .eq("slug", eventSlug)
        .eq("publication_status", "published")
        .maybeSingle(),
    );
    if (!record) {
      const alias = checked(
        await db
          .from("event_slug_redirects")
          .select("event_id")
          .eq("old_slug", eventSlug)
          .maybeSingle(),
      );
      if (alias)
        record = checked(
          await db
            .from("events")
            .select("slug")
            .eq("id", alias.event_id)
            .eq("publication_status", "published")
            .maybeSingle(),
        );
      if (record && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug))
        return { ...doc, status: 308, redirect: "/events/" + record.slug };
      return doc;
    }
    const description =
        text(record.short_description || record.description) ||
        publicDescription(path),
      heading = text(record.title, 200),
      when = new Date(record.start_at).toLocaleString("en-US", {
        timeZone: record.timezone || "America/New_York",
        dateStyle: "long",
        timeStyle: "short",
      });
    return {
      ...doc,
      status: 200,
      index: true,
      title: heading + " · GDG at Georgia Tech",
      heading,
      description,
      body: text(record.description, 1500),
      image: image(record.image_url, config.origin),
      event: { when, location: text(record.location, 300) },
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Event",
        name: heading,
        description,
        startDate: record.start_at,
        ...(record.end_at ? { endDate: record.end_at } : {}),
        url: doc.canonical,
        image: image(record.image_url, config.origin),
        eventStatus: record.previous_start_at
          ? "https://schema.org/EventRescheduled"
          : "https://schema.org/EventScheduled",
        ...(record.previous_start_at
          ? { previousStartDate: record.previous_start_at }
          : {}),
        location: { "@type": "Place", name: text(record.location, 300) },
      },
    };
  }
  if (known && !["/privacy", "/accessibility"].includes(path)) {
    const page = path === "/" ? "home" : path.slice(1),
      section =
        page === "home" ? "hero" : page === "contact" ? "main" : "header";
    const row = checked(
        await db
          .from("page_content")
          .select("content")
          .eq("page_slug", page)
          .eq("section_key", section)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle(),
      ),
      copy = row?.content;
    if (copy && typeof copy === "object" && !Array.isArray(copy)) {
      const heading = text(
        [copy.title, copy.accent].filter(Boolean).join(" "),
        200,
      );
      if (heading) {
        doc.heading = heading;
        doc.title = heading + " · GDG at Georgia Tech";
      }
      if (text(copy.description)) {
        doc.description = text(copy.description);
        doc.body = text(copy.description, 1500);
      }
    }
  }
  if (path === "/")
    doc.structuredData = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Google Developer Group on Campus at Georgia Institute of Technology",
      url: config.origin + "/",
      logo: config.origin + "/logo.png",
    };
  return doc;
}
