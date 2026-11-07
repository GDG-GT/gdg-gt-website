import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Individual gates: a well-covered helper cannot hide an untested sensitive
// route by averaging their coverage together.
const criticalModules = [
  "server/auth.mjs",
  "server/account-security.mjs",
  "server/access.mjs",
  "server/users.mjs",
  "server/forms.mjs",
  "server/form-access.mjs",
  "server/form-links.mjs",
  "server/form-collaborators.mjs",
  "server/form-deletion.mjs",
  "server/form-integrations.mjs",
  "server/uploads.mjs",
  "server/finances.mjs",
  "server/person-privacy.mjs",
  "server/lib/security.mjs",
  "server/lib/authorization.mjs",
  "server/lib/http.mjs",
  "server/lib/encryption.mjs",
  "server/lib/validation.mjs",
  "server/lib/upload-content.mjs",
  "server/lib/scanner.mjs",
  "server/lib/realtime-token.mjs",
  "server/lib/object-storage.mjs",
];

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "src/ui/**/*.test.ts",
      "tests/**/*.test.mjs",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "server/**/*.mjs", "shared/**/*.{mjs,ts}"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
      reporter: ["text-summary", "json", "json-summary", "html"],
      reportOnFailure: true,
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
        ...Object.fromEntries(
          criticalModules.map((file) => [file, { branches: 90 }]),
        ),
      },
    },
  },
});
