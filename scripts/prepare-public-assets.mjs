import sharp from "sharp";
import { chmod, stat } from "node:fs/promises";
for (const [source, target] of [["public/logo.png", "public/logo.webp"], ["public/assets/google-wordmark.png", "public/assets/google-wordmark.webp"]]) {
  await sharp(source).webp({ lossless: true, effort: 6 }).toFile(target);
  const original = await sharp(source).ensureAlpha().raw().toBuffer();
  const delivered = await sharp(target).ensureAlpha().raw().toBuffer();
  if (original.length !== delivered.length) throw Error("Lossless public asset dimensions changed.");
  for (let i = 0; i < original.length; i += 4) {
    if (original[i + 3] !== delivered[i + 3] || (original[i + 3] && [0, 1, 2].some((c) => original[i + c] !== delivered[i + c]))) throw Error("Lossless public asset changed visible color or transparency.");
  }
  if ((await stat(target)).size >= (await stat(source)).size) throw Error("Public delivery variant did not reduce transferred bytes.");
  await chmod(target, 0o644);
}
console.info("Prepared smaller public marks with identical visible pixels and transparency.");
