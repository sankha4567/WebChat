import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "."),
};

// Convex tests need the edge-runtime environment (convex-test depends on it).
// Pure utility tests run in node. We configure both as separate projects so
// each test file picks up the correct environment automatically based on
// its location.
export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    server: { deps: { inline: ["convex-test"] } },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
        },
      },
    ],
  },
});
