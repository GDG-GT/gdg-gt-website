export const publicPageDescriptions: Record<string, string> = {
  "/": "Google Developer Group on Campus at Georgia Institute of Technology. Discover student-led workshops, events, learning resources and opportunities to build together.",
  "/events":
    "Find Georgia Tech GDG workshops, hackathons and community events. Explore dates, venues, experience levels and registration details.",
  "/team":
    "Meet the students leading Google Developer Group on Campus at Georgia Institute of Technology and discover how to get involved.",
  "/resources":
    "Explore chapter-curated documentation, recordings, study jams and cloud learning opportunities for student developers at Georgia Tech.",
  "/sponsors":
    "Meet the partners supporting Georgia Tech student builders, explore sponsorship opportunities and see chapter-approved impact information.",
  "/gallery":
    "Explore approved photographs from Georgia Tech GDG events, workshops and community gatherings.",
  "/contact":
    "Contact Georgia Tech GDG about membership, events, sponsorship, speaking opportunities or accessibility.",
  "/privacy":
    "Learn how this Georgia Tech GDG installation handles registrations, newsletter subscriptions, contact inquiries, Forms, uploads and device reminders.",
  "/accessibility":
    "Accessibility information and a way to report barriers when using the Georgia Tech GDG website and chapter forms.",
};
export const publicIndexPaths = Object.keys(publicPageDescriptions);
export function publicMetadataPath(pathname: string) {
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}
export function publicDescription(pathname: string) {
  const path = publicMetadataPath(pathname);
  return (
    publicPageDescriptions[path] ||
    (/^\/events\/[a-z0-9-]+$/.test(path)
      ? "Explore this Georgia Tech GDG event, its schedule, venue and registration details."
      : "Google Developer Group on Campus at Georgia Institute of Technology.")
  );
}
