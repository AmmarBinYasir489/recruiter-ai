import { defineConfig } from "vitest/config";
import path from "path";

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./qa.db";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
});
