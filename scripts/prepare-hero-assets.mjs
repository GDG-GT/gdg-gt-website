import sharp from "sharp";
import { stat, chmod } from "node:fs/promises";
// Match the existing CSS cover crop at narrow portrait widths. This derives
// smaller delivery files from the current artwork; it creates no new artwork.
for (const [name, position] of [
  ["hero-atmosphere", 0.7],
  ["hero-campus", 0.5],
]) {
  const input = new URL(`../public/assets/${name}.webp`, import.meta.url),
    output = new URL(`../public/assets/${name}-mobile.webp`, import.meta.url),
    metadata = await sharp(input.pathname).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width / metadata.height < 2
  )
    throw Error("Expected the existing landscape hero artwork.");
  // Keep this wider than every <=480px CSS cover window. The second cover crop
  // uses the same focus point, so its visible source pixels match the original.
  const width = Math.round(metadata.height * 0.7),
    left = Math.round((metadata.width - width) * position);
  await sharp(input.pathname)
    .extract({ left, top: 0, width, height: metadata.height })
    .webp({ quality: 82, effort: 6 })
    .toFile(output.pathname);
  await chmod(output, 0o644);
  if ((await stat(output)).size > 50000)
    throw Error("Mobile hero delivery file exceeds its 50 kB ceiling.");
}
console.info("Prepared portrait hero crops from the existing local artwork.");
