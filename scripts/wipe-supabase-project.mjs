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

const expectedProject = "lvmnqpsfussgfizxvhpf";
const preservedBuckets = new Set(["ccat-question-images"]);
const execute = process.argv.includes("--execute");
const confirmation = process.env.CONFIRM_WIPE_SUPABASE;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const projectRef = url ? new URL(url).hostname.split(".")[0] : "";

if (projectRef !== expectedProject) throw new Error(`Refusing to wipe unexpected Supabase project: ${projectRef || "missing"}`);
if (!key) throw new Error("Supabase server secret is missing.");
if (execute && confirmation !== expectedProject) throw new Error("Explicit project wipe confirmation is missing.");

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const prisma = new PrismaClient();

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function inventory() {
  const publicTables = await prisma.$queryRawUnsafe(`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `);
  const newTables = await prisma.$queryRawUnsafe(`
    select tablename from pg_tables where schemaname = 'recruitment_portal' order by tablename
  `);
  const users = await listAllUsers();
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) throw bucketError;
  return {
    projectRef,
    publicTables: publicTables.map((row) => row.tablename),
    isolatedTables: newTables.map((row) => row.tablename),
    authUsers: users,
    buckets,
  };
}

try {
  const before = await inventory();
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    projectRef,
    publicTableCount: before.publicTables.length,
    isolatedTableCount: before.isolatedTables.length,
    authUserCount: before.authUsers.length,
    bucketIds: before.buckets.map((bucket) => bucket.id),
    preservedBucketIds: before.buckets.filter((bucket) => preservedBuckets.has(bucket.id)).map((bucket) => bucket.id),
  }));

  if (!execute) process.exit(0);

  for (const bucket of before.buckets) {
    if (preservedBuckets.has(bucket.id)) continue;
    const { error: emptyError } = await supabase.storage.emptyBucket(bucket.id);
    if (emptyError) throw new Error(`Could not empty bucket ${bucket.id}: ${emptyError.message}`);
    const { error: deleteError } = await supabase.storage.deleteBucket(bucket.id);
    if (deleteError) throw new Error(`Could not delete bucket ${bucket.id}: ${deleteError.message}`);
  }

  for (const user of before.authUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id, false);
    if (error) throw new Error(`Could not delete Supabase Auth user ${user.id}: ${error.message}`);
  }

  await prisma.$executeRawUnsafe(`
    drop schema if exists public cascade;
    drop schema if exists recruitment_portal cascade;
    create schema public authorization postgres;
    grant usage on schema public to anon, authenticated, service_role;
    grant all on schema public to postgres, service_role;
  `);

  console.log(JSON.stringify({
    ok: true,
    deletedPublicTables: before.publicTables.length,
    deletedIsolatedTables: before.isolatedTables.length,
    deletedAuthUsers: before.authUsers.length,
    deletedBuckets: before.buckets.filter((bucket) => !preservedBuckets.has(bucket.id)).length,
    preservedBuckets: [...preservedBuckets],
  }));
} finally {
  await prisma.$disconnect();
}
