import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runtimePrivileges, runtimePrivilegeErrors } from "../../scripts/runtime-privileges.mjs";

const matrix = runtimePrivileges as Record<string, string[]>;
const sql = readFileSync("supabase/migrations/20260903101845_stage_least_privilege_runtime_role.sql", "utf8");
const rows = () => Object.entries(matrix).map(([table_name, privileges]) => ({ table_name, privileges: [...privileges], rls: true }));

it("covers exactly the production models and matches the staged SQL", () => {
  const schema = readFileSync("prisma/schema.postgresql.prisma", "utf8");
  expect(Object.keys(matrix).sort()).toEqual([...schema.matchAll(/^model (\w+) \{/gm)].map(match => match[1]).sort());
  const sqlMatrix = Object.fromEntries([...sql.matchAll(/\('([A-Za-z]+)', '([A-Z,]+)'\)/g)].map(match => [match[1], match[2].split(",")]));
  expect(sqlMatrix).toEqual(matrix);
});

it("flags missing, excessive, unrelated and non-RLS privileges", () => {
  expect(runtimePrivilegeErrors(rows())).toEqual([]);
  const invalid = rows();
  invalid.find(r => r.table_name === "Question")!.privileges.push("UPDATE");
  invalid.find(r => r.table_name === "Application")!.privileges = ["SELECT"];
  invalid.find(r => r.table_name === "User")!.rls = false;
  invalid.push({ table_name: "ArchivedPrivateData", privileges: ["SELECT"], rls: true });
  expect(runtimePrivilegeErrors(invalid)).toEqual(expect.arrayContaining([
    "Question: unexpected UPDATE", "Application: missing INSERT", "Application: missing UPDATE",
    "User: RLS disabled", "ArchivedPrivateData: unrelated table access",
  ]));
  expect(runtimePrivilegeErrors([])).toHaveLength(18);
});

it("keeps critical history and question banks immutable to the backend", () => {
  expect(matrix.Question).toEqual(["SELECT"]);
  expect(matrix.AuditLog).toEqual(["SELECT", "INSERT"]);
  expect(matrix.ThresholdChange).toEqual(["SELECT", "INSERT"]);
  expect(Object.entries(matrix).filter(([, rights]) => rights.includes("DELETE")).map(([table]) => table).sort())
    .toEqual(["AuthRateLimit", "Session", "User"]);
  expect(sql).toContain('"authId" IS NULL AND "passwordHash" =');
  expect(sql).toContain('"expiresAt" < CURRENT_TIMESTAMP');
});

it("stages no login, membership, browser-grant changes or data deletion", () => {
  const statements = sql.replace(/--[^\n]*/g, "");
  expect(statements).toContain("CREATE ROLE portal_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  expect(statements).not.toMatch(/GRANT\s+portal_runtime\s+TO|REVOKE|DELETE\s+FROM|ALTER\s+TABLE|FOR\s+ALL|PASSWORD\s+'/i);
  expect(statements.trim()).toMatch(/^BEGIN;[\s\S]+COMMIT;$/);
  expect(sql).toContain("Existing policies require separate review");
  expect(sql).toContain("Effective privilege mismatch");
});

it("allows the explicit Prisma operations used in runtime sources", () => {
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      if (entry.name === "__tests__") return [];
      const path = join(dir, entry.name);
      return entry.isDirectory() ? files(path) : /\.(ts|tsx)$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
    });
  }
  const modelNames = Object.fromEntries(Object.keys(matrix).map(name => [name[0].toLowerCase() + name.slice(1), name]));
  const mapping: Record<string, string[]> = {
    create: ["INSERT"], createMany: ["INSERT"], update: ["SELECT", "UPDATE"], updateMany: ["SELECT", "UPDATE"],
    upsert: ["SELECT", "INSERT", "UPDATE"], delete: ["SELECT", "DELETE"], deleteMany: ["SELECT", "DELETE"],
  };
  let checked = 0;
  for (const path of [...files("app"), ...files("lib")]) {
    for (const match of readFileSync(path, "utf8").matchAll(/\.(\w+)\.(\w+)\s*\(/g)) {
      const table = modelNames[match[1]];
      if (!table) continue;
      const rights = mapping[match[2]] || (/^(find|count|aggregate|groupBy)/.test(match[2]) ? ["SELECT"] : []);
      for (const right of rights) expect(matrix[table], `${path}: ${match[1]}.${match[2]}`).toContain(right);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(100);
  // This source guard complements, but does not replace, PostgreSQL workflow tests.
});
