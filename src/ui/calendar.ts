type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  end_at?: string;
  time?: string;
  timezone?: string;
  location?: string;
  description?: string;
  updated_at?: string;
};
const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/[,;]/g, (match) => `\\${match}`);
const stamp = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = "",
    bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += length;
  }
  return result;
}
export function eventCalendar(
  event: CalendarEvent,
  canonicalUrl: string,
  now = new Date(),
): string {
  const timezone = event.timezone || "America/New_York",
    unknownTime = !event.time || /to be announced|\btba\b/i.test(event.time);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(event.date))
    .replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GDG at Georgia Tech//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${escape(timezone)}`,
    "BEGIN:VEVENT",
    `UID:${escape(event.id)}@${new URL(canonicalUrl).hostname}`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    unknownTime ? `DTSTART;VALUE=DATE:${date}` : `DTSTART:${stamp(event.date)}`,
    ...(!unknownTime && event.end_at ? [`DTEND:${stamp(event.end_at)}`] : []),
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`${event.description || ""}${unknownTime ? "\nTime to be announced." : ""}`)}`,
    `LOCATION:${escape(event.location || "Venue to be announced")}`,
    `URL:${escape(canonicalUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
