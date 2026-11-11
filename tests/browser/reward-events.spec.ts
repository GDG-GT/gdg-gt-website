import { test, expect, accessibility } from "./public-fixture";
const event = {
  id: "c3100000-0000-4000-8000-000000000001",
  title: "Fictional DevFest",
  origin: "https://event.example.org/",
  opens_at: "2026-11-08T00:00:00Z",
  closes_at: "2026-11-09T00:00:00Z",
  is_active: true,
  activity_id: null,
  revision: 1,
};
const member = {
  id: "c3100000-0000-4000-8000-000000000002",
  name: "Fictional Event Member",
  email: "fictional@example.test",
  points: 0,
};
const inventory = {
  members: [member],
  selectedMember: member,
  total: 1,
  rules: [],
  activities: [],
  perks: [],
  credentials: [],
  ledger: [],
  claims: [],
};
test("external event physical scan checks registration and retries the same attendance request", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const attempts: { key: string | undefined; body: string | null }[] = [];
  await page.route("**/api/v1/admin/reward-events**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { data: { events: [event], checkins: [] } },
      });
    if (path.endsWith("/lookup"))
      return route.fulfill({
        json: {
          data: {
            member,
            registration: { status: "registered", checkedIn: false },
            reviewId: "fictional-review",
          },
        },
      });
    if (path.endsWith("/confirm")) {
      attempts.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      if (attempts.length === 1) return route.abort("failed");
      return route.fulfill({
        json: { data: { id: "fictional-checkin", state: "completed" } },
      });
    }
    throw Error("Unexpected event write " + path);
  });
  await page.route("**/api/v1/admin/rewards**",r=>r.fulfill({json:{data:inventory}}));
  await page.addInitScript(()=>{
    Object.assign(window,{gdgScanner:{version:1,wallet:false,cardBinding:true},webkit:{messageHandlers:{gdgScanner:{postMessage:(m:{id:string;action:string})=>{if(m.action==="readCard")setTimeout(()=>window.dispatchEvent(new CustomEvent("gdg:scanner-result",{detail:{id:m.id,value:JSON.stringify({v:2,credential:"A".repeat(43),uid:"04aabbccddeeff"})}})),0);}}}}});
  });
  await page.goto("/admin/rewards");
  await page.getByRole("button",{name:"Event connections",exact:true}).click();
  await page.getByRole("combobox",{name:"Check-in event",exact:true}).selectOption(event.id);
  await page.getByRole("button",{name:"Start NFC scanning"}).click();
  await expect(
    page.getByRole("region", { name: "Event registration result" }),
  ).toContainText("Registration confirmed");
  expect(attempts).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm event check-in", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same event request", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Event check-in confirmed" }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(fixture.writes.filter((x) => x.includes("/award"))).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("event-nfc-handoff.png"),
    fullPage: true,
  });
});
test("connection creation protects its server credential and preserves it across workspace sections", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  let created = false;
  const writes: string[] = [];
  await page.route("**/api/v1/admin/rewards**", (r) =>
    r.fulfill({ json: { data: inventory } }),
  );
  await page.route("**/api/v1/admin/reward-events**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { data: { events: created ? [event] : [], checkins: [] } },
      });
    writes.push(route.request().postData() || "");
    created = true;
    return route.fulfill({
      json: { data: { ...event, credential: event.id + "." + "A".repeat(43) } },
    });
  });
  await page.goto("/admin/rewards");
  await page
    .getByRole("button", { name: "Event connections", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Event name", exact: true })
    .fill(event.title);
  await page
    .getByRole("textbox", { name: /^Event website/ })
    .fill(event.origin);
  await page
    .getByLabel("Check-in opens", { exact: true })
    .fill("2026-11-08T10:00");
  await page.getByLabel(/^Check-in closes/).fill("2026-11-08T18:00");
  await page.getByRole("checkbox", { name: "Enable event connection" }).check();
  await page
    .getByRole("button", { name: "Create event connection", exact: true })
    .click();
  const credential = page.getByRole("textbox", {
    name: "Server credential",
    exact: true,
  });
  await expect(credential).toHaveValue(event.id + "." + "A".repeat(43));
  await page
    .getByRole("button", { name: "Check-in scanner", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Event connections", exact: true })
    .click();
  await expect(credential).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "A".repeat(43),
  );
  await page
    .getByRole("button", { name: "I have saved this credential", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Event name", exact: true }),
  ).toHaveValue("");
  expect(writes).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("event-connections.png"),
    fullPage: true,
  });
});
test("signed-in members create private event link codes and can disconnect their event account", async ({
  page,
}) => {
  await page.route("**/api/v1/rewards/leaderboard**", (r) =>
    r.fulfill({
      json: { data: { items: [], total: 0, perks: [], ssoAvailable: true } },
    }),
  );
  let linked = false;
  const writes: string[] = [];
  await page.route("**/api/v1/rewards/me", (r) =>
    r.fulfill({
      json: {
        data: {
          ...member,
          csrf: "fictional-member-csrf",
          profile: null,
          credentials: [],
          ledger: [],
          claims: [],
        },
      },
    }),
  );
  await page.route("**/api/v1/rewards/event-links**", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          data: {
            events: [event],
            links: linked ? [{ eventId: event.id }] : [],
          },
        },
      });
    writes.push(new URL(r.request().url()).pathname);
    expect(r.request().headers()["x-rewards-csrf"]).toBe(
      "fictional-member-csrf",
    );
    if (r.request().url().endsWith("/code")) {
      linked = true;
      return r.fulfill({
        json: {
          data: { code: "B".repeat(43), expiresAt: "2099-11-08T12:10:00Z" },
        },
      });
    }
    linked = false;
    return r.fulfill({ json: { data: { unlinked: true } } });
  });
  await page.goto("/leaderboard/member");
  await page
    .getByRole("button", {
      name: "Get link code for Fictional DevFest",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Event link code", exact: true }),
  ).toHaveValue("B".repeat(43));
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "B".repeat(43),
  );
  await page
    .getByRole("button", { name: "Done with this code", exact: true })
    .click();
  await expect(
    page.getByText("Event account linked.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect Fictional DevFest", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Disconnect event?" })
    .getByRole("button", { name: "Disconnect event", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Get link code for Fictional DevFest",
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(await accessibility(page)).toEqual([]);
});
