import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const destination = new URL("../public/icons/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const [name, size, markWidth] of [["pwa-192", 192, 132], ["pwa-512", 512, 352], ["pwa-maskable-512", 512, 280], ["pwa-apple-180", 180, 120]]) {
  const logo = await sharp(new URL("../public/logo.png", import.meta.url).pathname).resize({ width: markWidth }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#f7f6f5" } }).composite([{ input: logo, gravity: "centre" }])
    .png().toFile(new URL(`${name}.png`, destination).pathname);
}
console.info("Prepared install icons from the project's existing approved logo.");

// Conventional /favicon.ico discovery for password managers and older clients.
// Small entries use the existing tab mark; the larger entry uses the square app mark.
const sizes = [16, 32, 48, 256], entries = [];
for (const size of sizes) {
  const source = new URL(size <= 32 ? "../public/favicon.png" : "../public/icons/pwa-512.png", import.meta.url);
  entries.push(await sharp(source.pathname).resize(size, size).png().toBuffer());
}
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (let i = 0; i < sizes.length; i++) {
  const start = 6 + i * 16;
  directory[start] = directory[start + 1] = sizes[i] === 256 ? 0 : sizes[i];
  directory.writeUInt16LE(1, start + 4);
  directory.writeUInt16LE(32, start + 6);
  directory.writeUInt32LE(entries[i].length, start + 8);
  directory.writeUInt32LE(offset, start + 12);
  offset += entries[i].length;
}
await writeFile(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([directory, ...entries]));
