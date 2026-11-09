import { test, expect, accessibility } from "./public-fixture";
const member = {
  id: "b2100000-0000-4000-8000-000000000003",
  name: "Fictional Member",
  email: "fictional-member@example.test",
  points: 25,
};
const activity = {
  id: "b2100000-0000-4000-8000-000000000004",
  title: "Fictional workshop",
  points: 10,
  opens_at: "2026-11-05T11:00:00Z",
  closes_at: "2026-11-05T13:00:00Z",
  revision: 1,
};
const inventory = {
  members: [member],
  total: 1,
  rules: [],
  activities: [activity],
  perks: [],
  credentials: [],
  ledger: [],
  claims: [],
  walletAvailable: false,
};
test("QR Wallet issuance downloads a private pass without NFC programming", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const id = "b2100000-0000-4000-8000-000000000005";
  await page.route("**/api/v1/admin/rewards**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/wallet/" + id))
      return r.fulfill({
        contentType: "application/vnd.apple.pkpass",
        headers: {
          "Content-Disposition": 'attachment; filename="gdg-member.pkpass"',
          "Cache-Control": "no-store",
        },
        body: "fictional-download-body-not-an-Apple-pass",
      });
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          data: {
            ...inventory,
            walletAvailable: true,
            walletNfcAvailable: false,
          },
        },
      });
    expect(r.request().postDataJSON()).toEqual({
      memberId: member.id,
      kind: "wallet",
      label: "iPhone membership",
    });
    return r.fulfill({
      json: {
        data: {
          id,
          credential: "W".repeat(43),
          url: "https://gdggt.dev/tap#card=" + "W".repeat(43),
        },
      },
    });
  });
  await page.goto("/admin/rewards");
  await page.getByRole("button", { name: /Fictional Member.*25 pts/ }).click();
  await page
    .getByRole("textbox", { name: "Credential label", exact: true })
    .fill("iPhone membership");
  await page
    .getByRole("combobox", { name: "Credential type", exact: true })
    .selectOption("wallet");
  await page
    .getByRole("button", { name: "Issue credential", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wallet pass ready" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy NFC URL", exact: true }),
  ).toHaveCount(0);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("wallet-qr-issuance.png"),
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download Apple Wallet pass", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("gdg-member.pkpass");
});
test("public leaderboard is standalone, private by default and usable without SSO", async ({
  page,
  fixture,
}, info) => {
  await page.route("**/api/v1/rewards/leaderboard**", (r) =>
    r.fulfill({
      json: {
        data: {
          items: [{ alias: "Fictional Builder", points: 25, rank: 1 }],
          total: 1,
          perks: [],
          ssoAvailable: false,
        },
      },
    }),
  );
  await page.route("**/api/v1/rewards/me", (r) =>
    r.fulfill({
      status: 401,
      json: {
        error: {
          code: "AUTH_REQUIRED",
          message: "Sign in with Georgia Tech to view your member account.",
        },
      },
    }),
  );
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "Show up. Build. Give back." }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional Builder", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(member.email, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chapter website" })).toHaveCount(
    1,
  );
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("leaderboard.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "My membership", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Sign in with Georgia Tech",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Georgia Tech sign-in is coming soon/),
  ).toBeVisible();
  expect(fixture.writes).toEqual([]);
});
test("super-admin awards require review and retry uses the same write key", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const writes: { key: string | undefined; body: string }[] = [];
  let attempts = 0;
  await page.route("**/api/v1/admin/rewards**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: inventory } });
    if (url.pathname.endsWith("/award")) {
      writes.push({
        key: r.request().headers()["idempotency-key"],
        body: r.request().postData() || "",
      });
      if (++attempts === 1) return r.abort("failed");
      return r.fulfill({
        json: { data: { id: "fictional-award", points: 10 } },
      });
    }
    return r.fulfill({
      status: 400,
      json: {
        error: { code: "BAD_REQUEST", message: "Unexpected fictional write" },
      },
    });
  });
  await page.goto("/admin/rewards");
  await expect(
    page.getByRole("link", { name: "Public leaderboard", exact: false }),
  ).toHaveAttribute("href", "https://leaderboards.gdggt.dev/");
  await expect(
    page.getByRole("heading", { name: "Member points & cards", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Fictional Member.*25 pts/ }).click();
  await page
    .getByRole("combobox", { name: "Check-in activity", exact: true })
    .selectOption(activity.id);
  await page
    .getByRole("button", { name: "Review check-in award", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await expect(
    page.getByRole("region", { name: "Confirm points change" }),
  ).toContainText("10 points");
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("rewards-admin.png"),
    fullPage: true,
  });
});
test("unsupported NFC provides honest iPhone handoff instructions", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.route("**/api/v1/admin/rewards**", (r) =>
    r.fulfill({ json: { data: inventory } }),
  );
  await page.goto("/admin/rewards");
  await page
    .getByRole("button", { name: "Check-in scanner", exact: true })
    .click();
  await expect(
    page.getByText(/On iPhone, tap a physical NFC card/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start NFC scanning", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use QR instead", exact: true }),
  ).toBeVisible();
});
test("card issuance programs a URL and QR for the same member identity", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.addInitScript(() => {
    class Reader {
      async write(message: unknown, options: unknown) {
        Object.assign(window, {
          fictionalNfcWrite: {
            message,
            options: {
              overwrite: (options as { overwrite: boolean }).overwrite,
            },
          },
        });
      }
      async scan() {}
      onreading = null;
      onreadingerror = null;
    }
    Object.assign(window, { NDEFReader: Reader });
  });
  const token = "B".repeat(43);
  let issuedUrl = "";
  await page.route("**/api/v1/admin/rewards**", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: inventory } });
    issuedUrl = new URL("/tap#card=" + token, r.request().url()).href;
    return r.fulfill({
      json: {
        data: {
          id: member.id,
          memberId: member.id,
          credential: token,
          url: issuedUrl,
        },
      },
    });
  });
  await page.goto("/admin/rewards");
  await page.getByRole("button", { name: /Fictional Member.*25 pts/ }).click();
  await page
    .getByRole("textbox", { name: "Credential label", exact: true })
    .fill("Fictional blue NFC card");
  await page
    .getByRole("button", { name: "Issue credential", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Issued NFC URL", exact: true }),
  ).toHaveValue(issuedUrl);
  await expect(
    page.getByRole("img", { name: "Member credential QR code", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Write blank NFC card", exact: true })
    .click();
  await expect(page.getByText(/Card written. Scan it to verify/)).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, "fictionalNfcWrite")),
  ).toEqual({
    message: { records: [{ recordType: "url", data: issuedUrl }] },
    options: { overwrite: false },
  });
});
test("members can opt into an alias and request a qualifying perk without admin access", async ({
  page,
}) => {
  let alias = "",
    isPublic = false,
    claimed = false;
  const writes: {
    path: string;
    csrf: string | undefined;
    key: string | undefined;
  }[] = [];
  const perk = {
    id: "b2100000-0000-4000-8000-000000000006",
    title: "Fictional chapter merch",
    description: "Fictional available item",
    threshold: 100,
  };
  await page.route("**/api/v1/rewards/**", (r) => {
    const path = new URL(r.request().url()).pathname.split("/").pop()!;
    if (path === "event-links")
      return r.fulfill({ json: { data: { events: [], links: [] } } });
    if (path === "leaderboard")
      return r.fulfill({
        json: {
          data: { items: [], total: 0, perks: [perk], ssoAvailable: true },
        },
      });
    if (path === "me")
      return r.fulfill({
        json: {
          data: {
            id: member.id,
            name: member.name,
            points: 150,
            alias,
            isPublic,
            csrf: "fictional-member-csrf",
            ledger: [],
            claims: claimed
              ? [
                  {
                    id: "fictional-claim",
                    perkId: perk.id,
                    title: perk.title,
                    status: "pending",
                  },
                ]
              : [],
          },
        },
      });
    writes.push({
      path,
      csrf: r.request().headers()["x-rewards-csrf"],
      key: r.request().headers()["idempotency-key"],
    });
    if (path === "profile") {
      const b = r.request().postDataJSON();
      alias = b.alias;
      isPublic = b.public;
    }
    if (path === "claim") claimed = true;
    return r.fulfill({ json: { data: { saved: true } } });
  });
  await page.goto("/leaderboard/member");
  await expect(
    page.getByRole("heading", { name: "Hi, Fictional Member" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /Display name/ })
    .fill("Fictional Builder");
  await page.getByRole("checkbox", { name: /Show my display name/ }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save profile", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Request perk", exact: true }).click();
  await expect(
    page.getByText("Request pending", { exact: true }),
  ).toBeVisible();
  expect(writes.map((w) => w.path)).toEqual(["profile", "claim"]);
  expect(
    writes.every((w) => w.csrf === "fictional-member-csrf" && !!w.key),
  ).toBe(true);
  expect(await accessibility(page)).toEqual([]);
});
test("changing a point rule does not rewrite existing activity values", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  let rule = {
    id: "b2100000-0000-4000-8000-000000000009",
    title: "Fictional attendance",
    points: 10,
    is_active: true,
    revision: 1,
  };
  const writes: unknown[] = [];
  await page.route("**/api/v1/admin/rewards**", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: { ...inventory, rules: [rule] } } });
    const body = r.request().postDataJSON();
    writes.push(body);
    rule = { ...rule, points: body.points, revision: 2 };
    return r.fulfill({ json: { data: rule } });
  });
  await page.goto("/admin/rewards");
  await page
    .getByRole("button", { name: "Activities & rules", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit rule", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Points", exact: true })
    .fill("15");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(
    page
      .getByRole("listitem")
      .getByText("Fictional attendance · 15 points", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Fictional workshop · 10 points" }),
  ).toBeVisible();
  expect(writes).toEqual([
    { id: rule.id, revision: 1, title: rule.title, points: 15, active: true },
  ]);
});

test("owned iPhone scanner resolves a card through the existing reviewed award flow", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.addInitScript(() => {
    Object.defineProperty(window, "gdgScanner", {
      value: { version: 1, wallet: false },
    });
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          gdgScanner: {
            postMessage: (message: { id: string; action: string }) => {
              if (message.action === "readCard")
                setTimeout(
                  () =>
                    window.dispatchEvent(
                      new CustomEvent("gdg:scanner-result", {
                        detail: { id: message.id, value: "R".repeat(43) },
                      }),
                    ),
                  20,
                );
            },
          },
        },
      },
    });
  });
  const writes: string[] = [];
  await page.route("**/api/v1/admin/rewards**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: inventory } });
    writes.push(path);
    expect(path).toBe("/api/v1/admin/rewards/resolve");
    expect(r.request().postDataJSON()).toEqual({ credential: "R".repeat(43) });
    return r.fulfill({
      json: {
        data: {
          ...member,
          credentialId: "b2100000-0000-4000-8000-000000000005",
          label: "Blue card",
        },
      },
    });
  });
  await page.goto("/admin/rewards");
  await page.getByRole("button", { name: "Check-in scanner" }).click();
  await page.getByRole("button", { name: "Start NFC scanning" }).click();
  await expect(
    page.getByRole("heading", { name: "Fictional Member", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Fictional Member fictional-member/ }),
  ).toBeVisible();
  expect(writes).toEqual(["/api/v1/admin/rewards/resolve"]);
  await accessibility(page);
});

test("fresh scanner sign-in keeps the gate and opens check-in without the public homepage", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = false;
  await page.addInitScript(() => {
    Object.defineProperty(window, "gdgScanner", {
      value: { version: 1, wallet: false },
    });
    Object.defineProperty(window, "webkit", {
      value: { messageHandlers: { gdgScanner: { postMessage: () => {} } } },
    });
  });
  let gateAccepted = false;
  await page.route("**/api/v1/auth/gate", async (r) => {
    expect(r.request().postDataJSON()).toEqual({ code: "fictional-gate" });
    gateAccepted = true;
    return r.fulfill({ json: { data: { gateValid: true } } });
  });
  await page.route("**/api/v1/auth/login", async (r) => {
    expect(gateAccepted).toBe(true);
    expect(r.request().postDataJSON()).toEqual({
      email: "officer@example.test",
      password: "fictional-password",
    });
    fixture.authenticated = true;
    return r.fulfill({
      json: {
        data: {
          user: {
            id: "fbbb0000-0000-4000-8000-000000000001",
            role: "super_admin",
          },
          csrfToken: "fictional-browser-csrf",
          sessionBinding: "b".repeat(64),
        },
      },
    });
  });
  await page.route("**/api/v1/admin/rewards**", (r) =>
    r.fulfill({ json: { data: inventory } }),
  );
  await page.goto("/admin/scanner");
  await expect(
    page.getByRole("heading", { name: "Scanner sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await accessibility(page);
  await page.screenshot({
    path: info.outputPath("scanner-sign-in.png"),
    fullPage: true,
  });
  await page.getByLabel("Access code", { exact: true }).fill("fictional-gate");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("officer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fictional-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/rewards$/);
  await expect(
    page.getByRole("button", { name: "Check-in scanner" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("scanner-signed-in.png"),
    fullPage: true,
  });
});
