import { describe, expect, it } from "vitest";
import { z } from "zod";
import { publicSiteStatus } from "../../shared/public-site-status.mjs";
import { siteStatusFields } from "../../shared/site-status.mjs";
// Preserve the previous public contract as an independent reference. Public
// parsing must still agree with the canonical write-field restrictions.
const reference = z
  .object({
    revision: z.number().int().min(1),
    ...siteStatusFields.shape,
    message: siteStatusFields.shape.message.or(z.literal("")),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      !siteStatusFields.safeParse({
        is_live: v.is_live,
        message: v.is_live && v.message === "" ? "Live" : v.message,
        redirect_url: v.redirect_url,
        button_text: v.button_text,
        auto_redirect: v.auto_redirect,
      }).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid public maintenance configuration.",
      });
  });
const base = {
  revision: 1,
  is_live: true,
  message: "",
  redirect_url: "",
  button_text: "Chapter updates",
  auto_redirect: false,
};
const compare = (input) => {
  const old = reference.safeParse(input),
    next = publicSiteStatus.safeParse(input);
  expect(next.success).toBe(old.success);
  if (old.success) expect(next.data).toEqual(old.data);
};
describe("public availability parser parity and strict boundaries", () => {
  it("retains exact normalization, required fields, types and bounds", () => {
    compare(base);
    for (const value of [
      null,
      [],
      "",
      1,
      true,
      undefined,
      {},
      { ...base, injected: "no" },
    ])
      compare(value);
    for (const key of Object.keys(base)) {
      const missing = { ...base };
      delete missing[key];
      compare(missing);
      for (const value of [
        null,
        undefined,
        [],
        {},
        0,
        -1,
        1.5,
        Infinity,
        NaN,
        true,
        false,
        "",
        "  ",
        " a ",
        "ok",
        "x".repeat(2001),
      ])
        compare({ ...base, [key]: value });
    }
    for (const button_text of [
      "x",
      "x".repeat(80),
      "x".repeat(81),
      "  Continue  ",
    ])
      compare({ ...base, button_text });
  });
  it("preserves live/maintenance, control-character and automatic-redirect constraints", () => {
    for (const is_live of [true, false])
      for (const auto_redirect of [true, false])
        for (const message of [
          "",
          " ",
          "a",
          "Live",
          "  Maintenance  ",
          "a\nb",
          "a\tb",
          "a\u0000b",
          "a\u007fb",
          "x".repeat(2000),
          "x".repeat(2001),
        ])
          for (const redirect_url of [
            "",
            "/l/chapter",
            "https://gatech.edu/events",
          ])
            compare({ ...base, is_live, auto_redirect, message, redirect_url });
  });
  it("shares the exact destination allowlist with server write validation", () => {
    for (const redirect_url of [
      "/l/a",
      "/l/chapter_2026",
      "/l/" + "a".repeat(50),
      "/l/" + "a".repeat(51),
      " /l/chapter ",
      "/l/-chapter",
      "/l/chapter-",
      "/l/chapter?x=1",
      "/l/chapter#token",
      "/admin",
      "https://gatech.edu/",
      "https://www.gatech.edu/events",
      "https://gdg.community.dev/chapter/",
      "http://gatech.edu/",
      "https://gatech.edu:444/",
      "https://evil.gatech.edu/",
      "https://gatech.edu.evil.test/",
      "https://user:pass@gatech.edu/",
      "https://gatech.edu/?secret=x",
      "https://gatech.edu/#token",
      "https://gatech.edu/a%2fb",
      "https://gatech.edu/a%5cb",
      "https://gatech.edu/a%0db",
      "https://gatech.edu/a b",
      "//evil.test",
      "javascript:alert(1)",
      "not a URL",
      "https://gatech.edu/" + "a".repeat(2000),
    ])
      compare({ ...base, redirect_url });
  });
});
