import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
const read = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");

describe("native password autofill domain contract", () => {
  it("associates both native configurations with the same published app identity", async () => {
    const project = await read("native/Scanner/project.yml"),
      team = project.match(/DEVELOPMENT_TEAM: (\S+)/)[1],
      bundle = project.match(/PRODUCT_BUNDLE_IDENTIFIER: (\S+)/)[1],
      association = JSON.parse(await read("public/apple-app-site-association.json"));
    expect(association.webcredentials.apps).toEqual([`${team}.${bundle}`]);
    // Credential sharing should not turn ordinary website links into app launches.
    expect(association.applinks).toBeUndefined();
    for (const file of ["Scanner.entitlements", "ScannerWallet.entitlements"]) {
      const entitlements = await read("native/Scanner/" + file);
      expect(entitlements).toMatch(/<key>com.apple.developer.associated-domains<\/key>\s*<array>\s*<string>webcredentials:gdggt.dev<\/string>/);
      expect(entitlements).toContain("com.apple.developer.nfc.readersession.formats");
    }
  });
  it("serves the extensionless Apple endpoint before the HTML catch-all as JSON", async () => {
    const config = JSON.parse(await read("vercel.json")),
      route = config.rewrites.findIndex(r => r.source === "/.well-known/apple-app-site-association"),
      fallback = config.rewrites.findIndex(r => r.destination.startsWith("/api/site?__route=/:") );
    expect(route).toBeGreaterThanOrEqual(0);
    expect(route).toBeLessThan(fallback);
    expect(config.rewrites[route].destination).toBe("/apple-app-site-association.json");
    expect(config.headers.find(h => h.source === "/.well-known/apple-app-site-association").headers)
      .toContainEqual({ key: "Content-Type", value: "application/json" });
  });
  it("publishes valid square icon variants and conventional discovery links", async () => {
    const html = await read("index.html"),
      icon = await readFile(new URL("../../public/favicon.ico", import.meta.url));
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('sizes="512x512" href="/icons/pwa-512.png"');
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon.readUInt16LE(4)).toBe(4);
    for (let i = 0; i < 4; i++) {
      const entry = 6 + i * 16, size = icon[entry] || 256,
        length = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12),
        metadata = await sharp(icon.subarray(offset, offset + length)).metadata();
      expect(metadata.width).toBe(size);
      expect(metadata.height).toBe(size);
      expect(metadata.format).toBe("png");
    }
    const config = JSON.parse(await read("vercel.json"));
    expect(config.rewrites).toContainEqual({ source: "/apple-touch-icon.png", destination: "/icons/pwa-apple-180.png" });
  });
});
