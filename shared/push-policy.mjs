// Keep the worker policy dependency-free; subscription validation belongs to API.
// Push content is untrusted and can only open a canonical public event.
export function pushNotification(value, origin) {
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
