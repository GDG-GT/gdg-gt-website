import { describe, it, expect, vi } from "vitest";
import { formDigestMessage } from "../../shared/form-digest.mjs";
import { deliveryMessage, deliveryCategory } from "../../server/delivery.mjs";

const notice = { date: "2026-11-10", forms: [
  { id: "f1000000-0000-4000-8000-000000000001", title: "Executive board <2027>", today: 2, total: 12 },
  { id: "f1000000-0000-4000-8000-000000000002", title: "Event interest", today: 0, total: 0 },
] };
describe("Forms daily digest", () => {
  it("shows each live form's daily and total counts with escaped titles and review links", () => {
    const mail = formDigestMessage(notice, "https://chapter.example.test");
    expect(mail.subject).toBe("Form responses · November 10, 2026");
    expect(mail.text).toContain("Today: 2\nTotal: 12");
    expect(mail.text).toContain("Today: 0\nTotal: 0");
    expect(mail.html).toContain("Executive board &lt;2027&gt;");
    expect(mail.html).not.toContain("<2027>");
    expect(mail.html).toContain("As of 11 pm Atlanta time");
    expect(mail.html).toContain("https://chapter.example.test/admin/forms/" + notice.forms[0].id + "/responses");
    expect(mail.html).toContain("https://gdggt.dev/logo.png");
  });
  it("uses the current chapter inbox and forms sender category only while the queue lease is valid", async () => {
    const db = { rpc: vi.fn(async () => ({ data: notice })) },
      job = { kind: "form_daily_digest", id: "fixture-job", lease_token: "fixture-lease" },
      config = { origin: "https://chapter.example.test" },
      mail = { chapter: "gdg@gatech.edu" };
    const message = await deliveryMessage(job, db, config, mail);
    expect(message.to).toBe("gdg@gatech.edu");
    expect(deliveryCategory(job.kind)).toBe("forms");
    expect(db.rpc).toHaveBeenCalledWith("prepare_form_daily_digest", { p_job: job.id, p_lease: job.lease_token });
    db.rpc.mockResolvedValue({ data: null });
    expect(await deliveryMessage(job, db, config, mail)).toBeNull();
  });
});
