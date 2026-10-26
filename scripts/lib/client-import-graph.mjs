import ts from "typescript";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
export async function clientImportGraph(root) {
  root = path.resolve(root);
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean),
    untrackedFiles = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
    tracked = trackedFiles.filter(
      (file) =>
        /\.(?:[jt]sx?|mjs)$/.test(file) &&
        ts.sys.fileExists(path.join(root, file)),
    ),
    untracked = untrackedFiles.filter((file) =>
      /\.(?:[jt]sx?|mjs)$/.test(file),
    ),
    config = ts.readConfigFile(
      path.join(root, "tsconfig.app.json"),
      ts.sys.readFile,
    ).config,
    options = ts.parseJsonConfigFileContent(config, ts.sys, root).options,
    resolutionCache = ts.createModuleResolutionCache(
      root,
      (file) => file,
      options,
    ),
    imports = new Map(),
    app = new Set(),
    all = new Set(),
    unresolved = [];
  async function visit(file, seen) {
    file = path.resolve(root, file);
    if (
      seen.has(file) ||
      !file.startsWith(root + path.sep) ||
      file.includes(path.sep + "node_modules" + path.sep)
    )
      return;
    seen.add(file);
    let source;
    if (seen === app || !imports.has(file))
      source = await readFile(file, "utf8");
    function inspect(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))
      )
        unresolved.push({
          file: path.relative(root, file),
          kind: "nonliteral dynamic import",
        });
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "glob"
      )
        unresolved.push({
          file: path.relative(root, file),
          kind: "glob import requires separate review",
        });
      ts.forEachChild(node, inspect);
    }
    if (seen === app)
      inspect(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
    if (!imports.has(file))
      imports.set(file, ts.preProcessFile(source, true, true).importedFiles);
    for (const item of imports.get(file)) {
      const resolved = ts.resolveModuleName(
        item.fileName,
        file,
        options,
        ts.sys,
        resolutionCache,
      ).resolvedModule?.resolvedFileName;
      if (resolved) await visit(resolved, seen);
      else if (
        (item.fileName.startsWith("@/") || item.fileName.startsWith(".")) &&
        !/\.(?:css|png|jpg|jpeg|webp|svg|woff2?)$/.test(item.fileName)
      )
        unresolved.push({
          file: path.relative(root, file),
          kind: "unresolved local import",
          specifier: item.fileName,
        });
    }
  }
  await visit("src/main.tsx", app);
  // Vite has a second HTML entry for the offline document. HTML module scripts
  // are real roots even though TypeScript's import resolver never sees them.
  for (const html of [...trackedFiles, ...untrackedFiles].filter(
    (file) => file.endsWith(".html") && !file.startsWith(".docs/"),
  )) {
    const source = await readFile(path.join(root, html), "utf8");
    for (const match of source.matchAll(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    )) {
      if (!/^(?:\/src\/|\.\/|\.\.\/)/.test(match[1])) continue;
      const entry = match[1].startsWith("/")
        ? match[1].slice(1)
        : path.join(path.dirname(html), match[1]);
      await visit(entry, app);
    }
  }
  for (const file of app) all.add(file);
  // Preserve anything referenced by scripts/tests or an existing untracked
  // source file. A user's untracked work is never a retirement candidate.
  for (const file of [...tracked, ...untracked].filter(
    (file) =>
      !file.startsWith("src/") ||
      /\.test\./.test(file) ||
      untracked.includes(file),
  ))
    await visit(file, all);
  const relative = (set) =>
    [...set]
      .filter((file) => file.startsWith(path.join(root, "src") + path.sep))
      .map((file) => path.relative(root, file))
      .sort();
  return {
    app: relative(app),
    referenced: relative(all),
    candidates: tracked.filter(
      (file) =>
        file.startsWith("src/") &&
        !file.endsWith(".d.ts") &&
        !all.has(path.resolve(root, file)),
    ),
    unresolved,
  };
}
