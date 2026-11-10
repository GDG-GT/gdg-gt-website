// Keep the worker policy dependency-free; subscription validation belongs to API.
// Push content is untrusted and can only open a canonical public event.
export function pushNotification(value, origin) {
  if (value?.type === "workspace-update" && /^[0-9a-f-]{36}$/.test(value.notificationId || "") && value.path === "/admin/notifications") {
    return { title: "GDG Workspace", options: { body: "You have a new chapter update.", icon: "/icons/pwa-192.png", tag: "gdg-update:" + value.notificationId,
      renotify: false, data: { url: new URL("/admin/notifications", origin).href } } };
  }
  if (
    !value ||
    value.type !== "event-reminder" ||
    typeof value.slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
    value.slug.length > 150 ||
    typeof value.occurrence !== "string" ||
    !Number.isFinite(Date.parse(value.occurrence))
  )
    return null;
  return {
    title: "GDG at Georgia Tech",
    options: {
      body: "An event you followed starts in about 24 hours. Open the event for current details.",
      icon: "/icons/pwa-192.png",
      tag: `gdg-event:${value.slug}:${value.occurrence}`,
      renotify: false,
      data: { url: new URL("/events/" + value.slug, origin).href },
    },
  };
}
export function canonicalPushClick(value, origin) {
  try {
    const u = new URL(value, origin);
    if (u.origin === origin && u.pathname === "/admin/notifications" && !u.search && !u.hash) return u.href;
    return u.origin === origin &&
      /^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(u.pathname) &&
      !u.search &&
      !u.hash
      ? u.href
      : new URL("/events", origin).href;
  } catch {
    return new URL("/events", origin).href;
  }
}
