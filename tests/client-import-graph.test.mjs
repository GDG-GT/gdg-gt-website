import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { clientImportGraph } from "../scripts/lib/client-import-graph.mjs";
const roots = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "gdg-import-graph-"));
  roots.push(root);
  await mkdir(path.join(root, "src", "pwa"), { recursive: true });
  await mkdir(path.join(root, "tests"));
  for (const [name, source] of Object.entries({
    "tsconfig.app.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
      },
    }),
    "index.html": '<script type="module" src="/src/main.tsx"></script>',
    "offline.html":
      '<script type="module" src="/src/pwa/offline.tsx"></script>',
    "src/main.tsx":
      'import "./static"; export const screen = () => import("./dynamic");',
    "src/static.ts": "export const answer = 42;",
    "src/dynamic.ts": "export const dynamic = true;",
    "src/pwa/offline.tsx": "export const offline = true;",
    "src/retired.ts": "export const retired = true;",
    "tests/support.mjs": 'import "../src/test-only";',
    "src/test-only.ts": "export const support = true;",
  }))
    await writeFile(path.join(root, name), source);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  await writeFile(path.join(root, "src/user-work.ts"), 'import "./test-only";');
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe("Application import security versus complete retirement references", () => {
  it("keeps all HTML roots and static/dynamic shipped dependencies in the application-only scan without suggesting retirements", async () => {
    const root = await fixture(),
      full = await clientImportGraph(root),
      app = await clientImportGraph(root, { includeReferences: false });
    expect(app.app).toEqual(full.app);
    expect(app.app).toEqual(
      expect.arrayContaining([
        "src/main.tsx",
        "src/pwa/offline.tsx",
        "src/static.ts",
        "src/dynamic.ts",
      ]),
    );
    expect(app.unresolved).toEqual([]);
    expect(app.candidates).toEqual([]);
    expect(full.referenced).toEqual(
      expect.arrayContaining(["src/test-only.ts", "src/user-work.ts"]),
    );
    expect(full.candidates).toContain("src/retired.ts");
    expect(full.candidates).not.toContain("src/test-only.ts");
  });
  it("shares each shipped AST exactly once with security inspection, including lazy and offline roots", async () => {
    const root = await fixture(),
      seen = new Map();
    const graph = await clientImportGraph(root, {
      includeReferences: false,
      inspectSource(file, ast) {
        expect(ast.fileName).toBe(path.join(root, file));
        seen.set(file, (seen.get(file) || 0) + 1);
      },
    });
    expect([...seen.keys()].sort()).toEqual(graph.app);
    expect([...seen.values()].every((count) => count === 1)).toBe(true);
    expect(seen.has("src/dynamic.ts")).toBe(true);
    expect(seen.has("src/pwa/offline.tsx")).toBe(true);
    expect(seen.has("src/test-only.ts")).toBe(false);
    expect(seen.has("src/user-work.ts")).toBe(false);
  });
  it("still rejects opaque dynamic imports reachable only from a lazy application module", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "src/dynamic.ts"),
      'const path = "./static"; export const open = () => import(path);',
    );
    const app = await clientImportGraph(root, { includeReferences: false });
    expect(app.unresolved).toContainEqual({
      file: "src/dynamic.ts",
      kind: "nonliteral dynamic import",
    });
  });
  it("still reports missing local imports from the offline entry", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "src/pwa/offline.tsx"),
      'import "./missing-private-boundary";',
    );
    const app = await clientImportGraph(root, { includeReferences: false });
    expect(app.unresolved).toContainEqual({
      file: "src/pwa/offline.tsx",
      kind: "unresolved local import",
      specifier: "./missing-private-boundary",
    });
  });
});
