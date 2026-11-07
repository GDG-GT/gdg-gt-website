import { describe, expect, it } from "vitest";
import { publicSiteStatus } from "../../shared/public-site-status.mjs";
import { readPublicSiteStatus } from "../../shared/public-site-status-read.mjs";

const base = {
  revision: 1,
  is_live: true,
  message: "",
  redirect_url: "",
  button_text: "Chapter updates",
  auto_redirect: false,
};
const values = [
  null,
  undefined,
  [],
  {},
  true,
  false,
  0,
  -1,
  1,
  1.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  "",
  " ",
  "a",
  "ab",
  " a ",
  " ab ",
  "a\u0000b",
  "a\tb",
  "x".repeat(80),
  "x".repeat(81),
  "x".repeat(2000),
  "x".repeat(2001),
  "/l/chapter",
  "https://gatech.edu/",
  "https://evil.test/",
];
function compare(input) {
  const canonical = publicSiteStatus.safeParse(input),
    read = readPublicSiteStatus(input);
  expect(read !== undefined).toBe(canonical.success);
  if (canonical.success) expect(read).toEqual(canonical.data);
}
describe("lightweight public availability projection reader", () => {
  it("matches the independent server schema across required fields, types, bounds, normalization and availability modes", () => {
    for (const input of [
      null,
      [],
      true,
      1,
      "",
      {},
      base,
      { ...base, extra: "no" },
    ])
      compare(input);
    for (const key of Object.keys(base)) {
      const missing = { ...base };
      delete missing[key];
      compare(missing);
      for (const value of values) compare({ ...base, [key]: value });
    }
    for (const is_live of [true, false])
      for (const auto_redirect of [true, false])
        for (const message of values)
          for (const redirect_url of values)
            compare({ ...base, is_live, auto_redirect, message, redirect_url });
  });
  it("preserves destination restrictions and produces a fresh primitive-only projection", () => {
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
      "https://gatech.edu/?x=1",
      "https://gatech.edu/#fragment",
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
    const input = Object.freeze({ ...base, button_text: "  Continue  " });
    const result = readPublicSiteStatus(input);
    expect(result).toEqual({ ...base, button_text: "Continue" });
    expect(result).not.toBe(input);
    expect(input.button_text).toBe("  Continue  ");
    expect(
      readPublicSiteStatus(Object.assign(Object.create(null), base)),
    ).toEqual(base);
  });
  it("rejects non-JSON prototypes, inherited fields and throwing getters without leaking an exception", () => {
    expect(readPublicSiteStatus(Object.create(base))).toBeUndefined();
    expect(
      readPublicSiteStatus(Object.assign(Object.create({ revision: 1 }), base)),
    ).toBeUndefined();
    expect(readPublicSiteStatus(new Date())).toBeUndefined();
    expect(
      readPublicSiteStatus({
        ...base,
        get message() {
          throw Error("Fictional malformed snapshot");
        },
      }),
    ).toBeUndefined();
    expect(
      readPublicSiteStatus({ ...base, privateValue: "Must never project" }),
    ).toBeUndefined();
  });
});
