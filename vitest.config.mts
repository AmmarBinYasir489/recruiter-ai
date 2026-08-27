import { defineConfig } from "vitest/config";
import path from "path";

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./qa.db";
// Unit/QA tests must be deterministic and must never consume live provider credits.
for (const key of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"]) {
  process.env[key] = "";
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
});
