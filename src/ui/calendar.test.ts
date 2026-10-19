import { describe, expect, it } from "vitest";
import { eventCalendar } from "./calendar";
const event = {
  id: "event-1",
  title: "Build, learn; together",
  date: "2026-10-23T17:00:00-04:00",
  time: "5 PM",
  timezone: "America/New_York",
};
describe("event calendar", () => {
  it("exports UTC time and a stable identifier without inventing an end time", () => {
    const value = eventCalendar(
      event,
      "https://example.test/events/build",
      new Date("2026-10-19T12:00:00Z"),
    );
    expect(value).toContain("DTSTART:20261023T210000Z");
    expect(value).toContain("UID:event-1@example.test");
    expect(value).not.toContain("DTEND:");
    expect(value).toContain("SUMMARY:Build\\, learn\\; together");
  });
  it("uses an all-day date for a time still to be announced", () => {
    const value = eventCalendar(
      {
        ...event,
        time: "Time to be announced",
        date: "2026-10-30T00:00:00-04:00",
      },
      "https://example.test/events/demo",
    );
    expect(value).toContain("DTSTART;VALUE=DATE:20261030");
    expect(value).not.toContain("DTSTART:20261030T040000Z");
  });
  it("folds long Unicode lines within 75 UTF-8 octets", () => {
    const value = eventCalendar(
      { ...event, title: "Builders 🧑‍💻 ".repeat(30) },
      "https://example.test/events/build",
    );
    for (const line of value.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
