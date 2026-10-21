import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const destination = new URL("../public/icons/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const [name, size, markWidth] of [["pwa-192", 192, 132], ["pwa-512", 512, 352], ["pwa-maskable-512", 512, 280], ["pwa-apple-180", 180, 120]]) {
  const logo = await sharp(new URL("../public/logo.png", import.meta.url).pathname).resize({ width: markWidth }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#f7f6f5" } }).composite([{ input: logo, gravity: "centre" }])
    .png().toFile(new URL(`${name}.png`, destination).pathname);
}
console.info("Prepared install icons from the project's existing approved logo.");
