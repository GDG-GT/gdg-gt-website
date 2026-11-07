import { cp, readFile, rm } from "node:fs/promises";
import path from "node:path";
const source = path.resolve("dist"), destination = path.resolve(".build/public"),
  template = path.join(source, "index.html");
if (!(await readFile(template, "utf8")).includes('id="root"'))
  throw Error("The completed application template must exist before packaging.");
// The private function includes dist/index.html. Do not publish it as a static
// index: Vercel's filesystem route would bypass fresh SSR/availability at '/'.
await rm(destination, { recursive: true, force: true });
await cp(source, destination, {
  recursive: true,
  filter: (file) => file !== template,
});
console.info("Prepared static assets without a public index; HTML stays with the server renderer.");
