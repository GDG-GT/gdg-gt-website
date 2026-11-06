import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { clientImportGraph } from "../scripts/lib/client-import-graph.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
let graph;
const violations = [];
beforeAll(async () => {
  // Security checks cover every shipped HTML root and reachable static/dynamic
  // dependency. Test/script-only references belong to the retirement audit;
  // scanning those here duplicates unrelated work under coverage contention.
  graph = await clientImportGraph(root, {
    includeReferences: false,
    inspectSource(file, ast) {
      function inspect(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression)
        ) {
          const name = node.expression.name.text;
          const standardArray =
            ts.isIdentifier(node.expression.expression) &&
            ["Array", "Uint8Array"].includes(node.expression.expression.text);
          if (name === "rpc" || (name === "from" && !standardArray))
            violations.push({ file, call: name });
          if (name === "createClient" && file !== "src/lib/scoped-realtime.ts")
            violations.push({ file, call: name });
        }
        ts.forEachChild(node, inspect);
      }
      inspect(ast);
    },
  });
});

describe("shipped browser architecture", () => {
  it("resolves both HTML entry points and retains the approved dynamic hero", () => {
    expect(graph.unresolved).toEqual([]);
    expect(graph.app).toEqual(
      expect.arrayContaining([
        "src/main.tsx",
        "src/pwa/offline.tsx",
        "src/pwa/SubmissionQueue.tsx",
        "src/ui/HeroScene.tsx",
        "src/ui/HeroObjects.tsx",
        "src/ui/forms/ResponseWorkspace.tsx",
      ]),
    );
  });

  it("keeps direct database calls out of the browser and confines SDK initialization to scoped Realtime", () => {
    expect(violations).toEqual([]);
  });
});
