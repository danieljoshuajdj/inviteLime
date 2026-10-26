import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    // Route tests load their route module lazily inside the first test
    // (`await import("./route")`), so that test pays the whole transform and
    // module-graph cost. On a cold cache and a busy machine that can exceed
    // vitest's 5s default and flake a single test; 20s leaves room without
    // hiding genuine hangs.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
