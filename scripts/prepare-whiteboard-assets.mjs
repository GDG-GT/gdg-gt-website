import { readdir, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(
  root,
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
);
const target = path.join(root, "public/assets/excalidraw/fonts");
async function copy(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.includes(" 2.")) continue;
    const next = path.join(relative, entry.name),
      from = path.join(directory, entry.name),
      to = path.join(target, next);
    if (entry.isDirectory()) await copy(from, next);
    else if (
      entry.isFile() &&
      (/\.(woff2|woff|txt|md)$/i.test(entry.name) ||
        /^(license|ofl|notice)/i.test(entry.name))
    ) {
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  }
}
await copy(source);
console.info(
  "Prepared local drawing fonts from the installed editor package; no remote assets fetched.",
);
