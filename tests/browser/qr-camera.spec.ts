import QRCode from "qrcode";
import { test, expect } from "./public-fixture";

test("camera focuses a detected chapter QR before resolving it once", async ({
  page,
  fixture,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium",
    "Canvas camera captureStream is a Chromium test source.",
  );
  fixture.authenticated = true;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const credential = "A".repeat(43),
    image = await QRCode.toDataURL(credential, { width: 320, margin: 4 });
  await page.addInitScript((image) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#273633";
      context.fillRect(0, 0, 640, 480);
      const qr = new Image();
      qr.src = image;
      await qr.decode();
      context.drawImage(qr, 160, 80, 320, 320);
      setInterval(() => context.drawImage(qr, 160, 80, 320, 320), 50);
      return canvas.captureStream(20);
    };
  }, image);
  let resolved = 0;
  await page.route("**/api/v1/admin/rewards**", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ credential });
      resolved++;
      return route.fulfill({
        json: {
          data: {
            id: "b2100000-0000-4000-8000-000000000003",
            name: "Fictional Member",
            email: "member@example.test",
            points: 0,
          },
        },
      });
    }
    return route.fulfill({
      json: {
        data: {
          members: [],
          total: 0,
          rules: [],
          activities: [],
          perks: [],
          credentials: [],
          ledger: [],
          claims: [],
          walletAvailable: false,
        },
      },
    });
  });
  await page.goto("/admin/rewards");
  await page
    .getByRole("button", { name: "Check-in scanner", exact: true })
    .click();
  await page.getByRole("button", { name: "Use QR instead" }).click();
  await expect(page.locator(".rewards-qr-camera.is-detected")).toBeVisible();
  expect(resolved).toBe(0);
  await page.screenshot({ path: info.outputPath("qr-detected.png") });
  await expect.poll(() => resolved).toBe(1);
  await expect(page.locator(".rewards-qr-camera")).toHaveCount(0);
});
