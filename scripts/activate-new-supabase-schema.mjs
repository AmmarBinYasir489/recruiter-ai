import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const expectedProject = "lvmnqpsfussgfizxvhpf";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const projectRef = url ? new URL(url).hostname.split(".")[0] : "";
if (projectRef !== expectedProject) throw new Error(`Unexpected Supabase project: ${projectRef || "missing"}`);

const prisma = new PrismaClient();
try {
  const schemas = await prisma.$queryRawUnsafe(`
    select schema_name from information_schema.schemata
    where schema_name in ('public', 'recruitment_portal', 'recruitment_portal_v2_archive')
    order by schema_name
  `);
  const names = new Set(schemas.map((row) => row.schema_name));
  if (names.has("recruitment_portal_v2_archive")) throw new Error("Archive schema already exists; refusing to overwrite it.");
  if (!names.has("public") || !names.has("recruitment_portal")) throw new Error("Expected old and new schemas are not both present.");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("alter schema public rename to recruitment_portal_v2_archive");
    await tx.$executeRawUnsafe("alter schema recruitment_portal rename to public");
    await tx.$executeRawUnsafe("revoke all on schema recruitment_portal_v2_archive from public, anon, authenticated");
    await tx.$executeRawUnsafe("grant usage on schema public to service_role");
    await tx.$executeRawUnsafe("grant all on schema public to postgres, service_role");
  });
  console.log(JSON.stringify({ ok: true, projectRef, archivedSchema: "recruitment_portal_v2_archive", activeSchema: "public" }));
} finally {
  await prisma.$disconnect();
}
