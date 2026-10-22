import { describe, it, expect } from "vitest";
import {
  formRespondentSchema,
  respondentLabel,
  responseCopyText,
} from "../../shared/form-respondent.mjs";
import { deliveryMessage } from "../../server/delivery.mjs";
import { createTemplate } from "../../shared/forms.ts";
describe("identified Forms and respondent-requested copies", () => {
  it("requires name and email without accepting client verification claims", () => {
    for (const value of [
      {},
      { name: "A", email: "person@example.test" },
      { name: "Person", email: "bad" },
      { name: "Person\nHeader", email: "person@example.test" },
      { name: "Person", email: "person@example.test", verified: true },
    ])
      expect(formRespondentSchema.safeParse(value).success).toBe(false);
    expect(
      formRespondentSchema.parse({
        name: " Person ",
        email: "PERSON@EXAMPLE.TEST ",
      }),
    ).toEqual({ name: "Person", email: "person@example.test" });
    expect(respondentLabel("self_reported")).toContain("unverified");
    expect(respondentLabel("legacy_unknown")).toContain("unavailable");
  });
  it("does not construct mail for a revoked, removed or expired response", async () => {
    expect(
      await deliveryMessage(
        { kind: "form_respondent_copy" },
        { rpc: async () => ({ data: null }) },
        {},
        {},
      ),
    ).toBe(null);
  });
  it("includes exact own answers including sensitive values, never private URLs or other recipients", async () => {
    const f = createTemplate("Copy test");
    f.fields[0].sensitive = true;
    const notice = {
      responseId: "fixture",
      title: f.title,
      version: 1,
      submittedAt: "2026-10-21T12:00:00Z",
      name: "Person",
      email: "person@example.test",
      definition: f,
      values: {
        [f.fields[0].id]: "<script>my exact answer</script>",
        [f.fields[1].id]: "person@example.test",
      },
      files: {},
    };
    const message = await deliveryMessage(
      {
        kind: "form_respondent_copy",
        id: "fixture",
        lease_token: "lease",
        payload: { to: "other@example.test" },
      },
      {
        rpc: async (name) => {
          expect(name).toBe("prepare_form_respondent_copy");
          return { data: notice };
        },
      },
      {},
      { from: "chapter@example.test" },
    );
    expect(message.to).toBe("person@example.test");
    expect(message.cc).toBeUndefined();
    expect(message.bcc).toBeUndefined();
    expect(message.text).toContain("<script>my exact answer</script>");
    expect(message.html).not.toContain("<script>");
    expect(message.text).not.toContain("/admin/");
    expect(message.text).not.toContain("other@example.test");
  });
  it("preserves multiline, multi-select, numeric zero and grid values without truncation", () => {
    const text = responseCopyText({
      title: "Test",
      version: 1,
      submittedAt: "2026-10-21T12:00:00Z",
      responseId: "fixture",
      name: "Person",
      email: "person@example.test",
      answers: [
        { label: "Long", value: "x".repeat(20000) },
        { label: "Number", value: 0 },
        { label: "Grid", value: { Row: ["One", "Two"] } },
        { label: "Multi", value: ["A", "B"] },
      ],
    });
    expect(text).toContain("x".repeat(20000));
    expect(text).toContain("Number\n0");
    expect(text).toContain("Row: One, Two");
    expect(text).toContain("Multi\nA, B");
  });
});
