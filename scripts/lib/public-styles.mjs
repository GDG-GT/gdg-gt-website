import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
export const canonicalStyleFiles = ["src/styles/gt.css", "src/styles/media.css", "src/styles/newsletter.css", "src/styles/contact-inbox.css"];
// Include every public workflow, including lazy login, invitation and Forms
// children. Re-exports and literal dynamic imports are part of this closure.
const seeds = ["src/ui/SiteShell.tsx", "src/ui/HomePage.tsx", "src/ui/PublicPages.tsx", "src/ui/forms/PublicForm.tsx", "src/pages/Linktree.tsx", "src/ui/teams/AcceptTeamInvitation.tsx", "src/ui/users/AccountSetup.tsx", "src/ui/NewsletterTokenPage.tsx", "src/ui/status/SiteAvailability.tsx", "src/ui/NavigationSafety.tsx", "src/ui/RouteErrorBoundary.tsx", "src/pwa/SubmissionQueue.tsx", "src/pwa/PwaControls.tsx", "src/contexts/ContentContext.tsx", "src/contexts/AdminContext.tsx"];
export async function preparePublicStyles(root = process.cwd()) {
  const seen = new Set(), tokens = new Set(), prefixes = new Set();
  function collectTokens(source) {
    for (const match of source.matchAll(/\bgt-[A-Za-z0-9_-]+/g)) tokens.add(match[0]);
    for (const match of source.matchAll(/\b(gt-[A-Za-z0-9_-]*)\$\{/g)) prefixes.add(match[1]);
    for (const match of source.matchAll(/["'`](gt-[A-Za-z0-9_-]*)["'`]\s*\+/g)) prefixes.add(match[1]);
  }
  // The router owns public loading placeholders but also imports every private
  // route. Collect its own markup without pulling private route trees into CSS.
  collectTokens(await readFile(path.join(root, "src/App.tsx"), "utf8"));
  async function resolve(from, spec) {
    const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return;
    for (const candidate of [base, ...[".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"].map((suffix) => base + suffix)]) {
      try { if ((await stat(candidate)).isFile()) return candidate; } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
    }
  }
  async function walk(file) {
    if (seen.has(file) || !/\.(?:tsx?|m?js)$/.test(file)) return;
    seen.add(file);
    const source = await readFile(file, "utf8");
    collectTokens(source);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), imports = [];
    function visit(node) {
      if ((ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && !node.isTypeOnly) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const spec of imports) { const dependency = await resolve(file, spec); if (dependency) await walk(dependency); }
  }
  for (const seed of seeds) await walk(path.join(root, seed));
  let css = "/* Generated from canonical styles and the complete public source closure. Do not edit. */\n", omitted = 0;
  for (const file of canonicalStyleFiles) {
    const parsed = postcss.parse(await readFile(path.join(root, file), "utf8"));
    parsed.walkRules((rule) => {
      try {
        const selectors = selectorParser().astSync(rule.selector);
        if (selectors.nodes.every((selector) => selector.nodes.some((node) => node.type === "class" && node.value.startsWith("gt-") && !tokens.has(node.value) && ![...prefixes].some((prefix) => node.value.startsWith(prefix))))) { omitted++; rule.remove(); }
      } catch { /* Unknown selectors stay in the public sheet conservatively. */ }
    });
    parsed.walkAtRules((rule) => { if (rule.nodes && !rule.nodes.length) rule.remove(); });
    css += parsed.toString() + "\n";
  }
  const output = path.join(root, "src/styles/public.generated.css");
  let previous; try { previous = await readFile(output, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previous !== css) await writeFile(output, css);
  return { modules: seen.size, omitted, bytes: Buffer.byteLength(css) };
}
