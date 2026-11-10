import { describe, it, expect, vi } from "vitest";
import { deliveryMessage, deliveryCategory } from "../../server/delivery.mjs";
import { createTemplate, formDefinitionSchema } from "../../shared/forms.ts";

const id = "f1530000-0000-4000-8000-000000000001";
function fixture(enabled = true) {
  const rows = {
    forms: { id, title: "Executive board <application>", owner_id: id, state: "Open", settings: { notifyOnSubmission: enabled } },
    form_responses: { id, submitted_at: "2026-11-10T15:00:00Z", deleted_at: null, redacted_at: null },
  }, upsert = vi.fn(async () => ({ data: {} })),
    db = {
      rpc: vi.fn(async () => ({ data: true })),
      from(table) {
        const chain = { select: () => chain, eq: () => chain,
          maybeSingle: async () => ({ data: rows[table] }), upsert };
        return chain;
      },
    },
    job = { kind: "form_response_notification", id, lease_token: id, payload: { formId: id, responseId: id, email: "forged@example.test" } },
    config = { origin: "https://chapter.example.test" }, mail = { chapter: "gdg@gatech.edu" };
  return { rows, db, job, config, mail, upsert, send: () => deliveryMessage(job, db, config, mail) };
}
describe("Per-submission chapter email toggle", () => {
  it("retains the optional setting without changing older published schema hashes", () => {
    const form = createTemplate("Fixture", "blank");
    const definition = { title: form.title, description: form.description, fields: form.fields, sections: form.sections, settings: form.settings };
    expect(formDefinitionSchema.parse(definition).settings.notifyOnSubmission).toBeUndefined();
    for (const value of [true, false]) {
      expect(formDefinitionSchema.parse({ ...definition, settings: { ...definition.settings, notifyOnSubmission: value } }).settings.notifyOnSubmission).toBe(value);
    }
    expect(formDefinitionSchema.safeParse({ ...definition, settings: { ...definition.settings, notifyOnSubmission: "yes" } }).success).toBe(false);
  });
  it("sends only to the configured chapter inbox with a review button and retains the existing workspace notification", async () => {
    const f = fixture(), message = await f.send();
    expect(message.to).toBe("gdg@gatech.edu");
    expect(message.subject).toBe("New response: " + f.rows.forms.title);
    expect(message.html).toContain("Review response");
    expect(message.html).toContain("&lt;application&gt;");
    expect(message.html).not.toContain("forged@example.test");
    expect(message.html).not.toContain("<application>");
    expect(f.upsert).toHaveBeenCalledTimes(1);
    expect(deliveryCategory(f.job.kind)).toBe("forms");
  });
  it.each([false, undefined])("does not send when the setting is %s", async enabled => {
    const f = fixture(); f.rows.forms.settings.notifyOnSubmission = enabled;
    expect(await f.send()).toBeNull();
    expect(f.upsert).toHaveBeenCalledTimes(1);
  });
  it.each(["deleted_at", "redacted_at", "missing", "archived"])("suppresses %s responses/forms", async state => {
    const f = fixture();
    if (state === "archived") f.rows.forms.state = "Archived";
    else if (state === "missing") f.rows.form_responses = null;
    else f.rows.form_responses[state] = "2026-11-10T15:01:00Z";
    expect(await f.send()).toBeNull();
  });
  it.each([true, false])("does not duplicate an older chapter alert when the simple setting is %s", async enabled => {
    const f = fixture(enabled);
    f.db.rpc.mockResolvedValue({ data: { chapterInbox: true, purpose: "notification", formId: id } });
    expect(await deliveryMessage({ ...f.job, kind: "form_reviewed_email" }, f.db, f.config, f.mail)).toBeNull();
  });
});
