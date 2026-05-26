import { defineConfig } from "vitest/config";

// Tests live in test/ (outside src/) so they are never compiled into dist/
// or shipped to npm. Vitest resolves the ".js" import specifiers in src/*
// (NodeNext style) back to their ".ts" sources automatically.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
