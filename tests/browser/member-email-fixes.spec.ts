import { test, expect, accessibility } from "./public-fixture";
const member = {
  id: "b2100000-0000-4000-8000-000000000003",
  name: "Fictional Member",
  email: "fictional@example.test",
  points: 25,
};
const card = {
  id: "b2100000-0000-4000-8000-000000000005",
  kind: "wallet",
  label: "Membership pass",
  created_at: "2026-11-01T12:00:00Z",
  revoked_at: null,
};
const inventory = {
  members: [member],
  selectedMember: member,
  total: 1,
  rules: [],
  activities: [],
  perks: [],
  credentials: [card],
  ledger: [
    {
      id: "b2100000-0000-4000-8000-000000000006",
      points: 10,
      reason: "Fictional workshop",
      created_at: "2026-11-01T12:00:00Z",
      reversed_at: null,
    },
  ],
  claims: [],
  walletAvailable: true,
};
test("existing pass can be emailed without reissuing and destructive review stays visible at the viewport", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/admin/rewards**", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: inventory } });
    writes.push({
      path: new URL(r.request().url()).pathname,
      body: r.request().postDataJSON(),
    });
    return r.fulfill({ json: { data: { queued: true, id: card.id } } });
  });
  await page.goto("/admin/rewards");
  await page.getByRole("button", { name: /Fictional Member.*25 pts/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Credential type" }).locator("option"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Email card to member", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Credential email queued/ }),
  ).toBeVisible();
  expect(writes).toEqual([
    { path: "/api/v1/admin/rewards/credential-email", body: { id: card.id } },
  ]);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Revoke this credential?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Revoke credential" }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath("revoke-dialog.png") });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Reverse entry", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(writes).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
});
test("email card is standalone, strips its private ticket, and exposes Wallet actions under its QR", async ({
  page,
}, info) => {
  await page.route("**/api/v1/rewards/email-pass", (r) => {
    const body = r.request().postDataJSON();
    expect(body.ticket).toBe("fictional-private-email-ticket");
    return r.fulfill({
      json: {
        data:
          body.provider === "info"
            ? {
                name: "Fictional Member",
                reference: "0005",
                apple: true,
                google: false,
                googlePending: true,
              }
            : { credential: "A".repeat(43) },
      },
    });
  });
  await page.goto("/pass#ticket=fictional-private-email-ticket");
  await expect(
    page.getByRole("img", { name: "Your private GDG membership QR" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pass$/);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  const qr = page.getByRole("img", { name: "Your private GDG membership QR" });
  const apple = page.getByRole("button", { name: "Add to Apple Wallet" });
  await expect(apple).toBeVisible();
  expect((await apple.boundingBox())!.y).toBeGreaterThan(
    (await qr.boundingBox())!.y,
  );
  await expect(
    page.getByRole("button", { name: "Add to Google Wallet" }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Save QR image" }).click();
  expect((await download).suggestedFilename()).toBe("GDG-Member-0005.png");
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("email-membership-card.png"),
    fullPage: true,
  });
});
test("expired private email links show an actionable error and no QR or Wallet access", async ({
  page,
}) => {
  await page.route("**/api/v1/rewards/email-pass", (r) =>
    r.fulfill({
      status: 404,
      json: {
        error: {
          message: "This card link has expired. Ask the chapter to resend it.",
        },
      },
    }),
  );
  await page.goto("/pass#ticket=fictional-expired-email-ticket");
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(
    page.getByRole("img", { name: "Your private GDG membership QR" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add to Apple Wallet" }),
  ).toHaveCount(0);
});

test("membership email renders its inline QR and attachment layout on desktop and mobile", async ({
  page,
}, info) => {
  const { rewardCredentialMessage } =
    await import("../../server/rewards-email.mjs");
  const { encryptPayload } = await import("../../server/lib/encryption.mjs");
  const secret = "fictional-email-preview-only-secret-long-enough";
  const message = await rewardCredentialMessage(
    { id: card.id, lease_token: card.id },
    {
      rpc: async () => ({
        data: {
          id: card.id,
          kind: "wallet",
          name: member.name,
          email: member.email,
          encryptedToken: encryptPayload(
            { credential: "A".repeat(43) },
            secret,
          ),
          createdAt: new Date().toISOString(),
        },
      }),
    },
    {
      origin: "https://gdggt.dev",
      rewardsOrigin: "https://leaderboards.gdggt.dev",
      encryptionSecret: secret,
    },
    { from: "chapter@example.test" },
    {},
  );
  await page.setContent(
    message!.html.replace(
      "cid:gdg-member-qr",
      "data:image/png;base64," + message!.attachments[0].content,
    ),
  );
  await expect(
    page.getByRole("img", { name: /Your private GDG membership QR/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open my membership card" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(message!.attachments[1].contentId).toBeUndefined();
  await page.screenshot({
    path: info.outputPath("membership-email.png"),
    fullPage: true,
  });
});
