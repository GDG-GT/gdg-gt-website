import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  publicDescription,
  publicIndexPaths,
  publicMetadataPath,
} from "../../shared/public-metadata";
export function usePublicMetadata(
  title: string,
  options: {
    description?: string;
    image?: string;
    event?: boolean;
    noindex?: boolean;
    noarchive?: boolean;
  } = {},
) {
  const { pathname } = useLocation(),
    path = publicMetadataPath(pathname),
    description = (options.description || publicDescription(path))
      .replace(/<[^>]*>/g, "")
      .slice(0, 160),
    image = options.image || "/logo.png",
    noindex =
      options.noindex ??
      !(publicIndexPaths.includes(path) || /^\/events\/[a-z0-9-]+$/.test(path)),
    kind = options.event ? "article" : "website",
    noarchive = options.noarchive === true;
  useEffect(() => {
    const origin = window.location.origin,
      canonicalUrl = new URL(path, origin).href,
      previousTitle = document.title,
      restore: (() => void)[] = [];
    document.title = title;
    function meta(name: string, content: string) {
      const attribute = name.startsWith("og:") ? "property" : "name",
        selector = `meta[${attribute}="${name}"]`;
      const existing = Array.from(
        document.head.querySelectorAll<HTMLMetaElement>(selector),
      );
      const node = existing[0] || document.createElement("meta"),
        previous = existing[0]?.content;
      for (const duplicate of existing.slice(1)) duplicate.remove();
      node.setAttribute(attribute, name);
      node.content = content;
      if (!node.isConnected) document.head.append(node);
      restore.push(() => {
        if (node.content !== content) return;
        if (previous === undefined) node.remove();
        else node.content = previous;
      });
    }
    meta("description", description);
    meta("og:title", title);
    meta("og:description", description);
    meta("og:type", kind);
    meta("og:url", canonicalUrl);
    meta("twitter:card", "summary_large_image");
    meta("twitter:title", title);
    meta("twitter:description", description);
    let imageUrl = new URL("/logo.png", origin).href;
    try {
      const value = new URL(image, origin);
      if (
        (value.origin === origin || value.protocol === "https:") &&
        !value.username &&
        !value.password
      )
        imageUrl = value.href;
    } catch {
      /* Use supplied local mark. */
    }
    meta("og:image", imageUrl);
    meta("twitter:image", imageUrl);
    meta(
      "robots",
      (noindex ? "noindex, nofollow" : "index, follow") +
        (noarchive ? ", noarchive" : ""),
    );
    const links = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>(
          'link[rel="canonical"]',
        ),
      ),
      canonical = links[0] || document.createElement("link"),
      previousCanonical = links[0]?.href;
    for (const duplicate of links.slice(1)) duplicate.remove();
    canonical.rel = "canonical";
    canonical.href = canonicalUrl;
    if (!canonical.isConnected) document.head.append(canonical);
    restore.push(() => {
      if (canonical.href !== canonicalUrl) return;
      if (previousCanonical === undefined) canonical.remove();
      else canonical.href = previousCanonical;
    });
    let organization: HTMLScriptElement | undefined;
    if (path === "/") {
      organization = document.createElement("script");
      organization.type = "application/ld+json";
      organization.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Google Developer Group on Campus at Georgia Institute of Technology",
        url: origin + "/",
        logo: new URL("/logo.png", origin).href,
      }).replace(/</g, "\\u003c");
      document.head.append(organization);
    }
    return () => {
      restore.reverse().forEach((run) => run());
      organization?.remove();
      if (document.title === title) document.title = previousTitle;
    };
  }, [title, path, description, image, noindex, kind, noarchive]);
}
