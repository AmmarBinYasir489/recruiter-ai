import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const prisma = new PrismaClient();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

try {
  const [banks, publicTables, archiveTables, rlsTables, browserGrants, users, drives, funnels] = await Promise.all([
    prisma.question.groupBy({ by: ["bank"], _count: { _all: true }, orderBy: { bank: "asc" } }),
    prisma.$queryRawUnsafe(`select count(*)::int as count from pg_tables where schemaname = 'public'`),
    prisma.$queryRawUnsafe(`select count(*)::int as count from pg_tables where schemaname = 'recruitment_portal_v2_archive'`),
    prisma.$queryRawUnsafe(`select count(*)::int as count from pg_tables where schemaname = 'public' and rowsecurity = true`),
    prisma.$queryRawUnsafe(`
      select count(*)::int as count from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
    `),
    prisma.user.count(),
    prisma.drive.count(),
    prisma.funnel.count(),
  ]);
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const ccat = buckets.find((bucket) => bucket.id === "ccat-question-images");
  const { data: ccatObjects, error: ccatError } = ccat
    ? await supabase.storage.from(ccat.id).list("", { limit: 1 })
    : { data: [], error: null };
  if (ccatError) throw ccatError;

  console.log(JSON.stringify({
    ok: true,
    projectRef: new URL(url).hostname.split(".")[0],
    publicTables: publicTables[0]?.count ?? 0,
    archiveTables: archiveTables[0]?.count ?? 0,
    rlsTables: rlsTables[0]?.count ?? 0,
    browserRoleTableGrants: browserGrants[0]?.count ?? 0,
    portalUsers: users,
    drives,
    funnels,
    questionBanks: Object.fromEntries(banks.map((bank) => [bank.bank, bank._count._all])),
    buckets: buckets.map((bucket) => ({ id: bucket.id, public: bucket.public })),
    ccatBucketAccessible: Boolean(ccat && ccatObjects),
  }));
} finally {
  await prisma.$disconnect();
}
