import nextEnv from "@next/env";
import pg from "pg";
import { readFileSync } from "node:fs";
import { runtimePrivilegeErrors, runtimePrivilegeQuery } from "./runtime-privileges.mjs";
nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const dbUrl = process.env.SUPABASE_DATABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !dbUrl || !publicKey || !key) throw new Error("Supabase environment configuration is incomplete.");
const ref = new URL(url).hostname.split(".")[0];
let validOrigin = false;
try {
  const origin = new URL(process.env.APP_URL || "");
  validOrigin = origin.protocol === "https:" && origin.pathname === "/" && !origin.search && !origin.hash
    && !origin.username && !origin.password && !["localhost", "example.com", "your-portal.example.com"].includes(origin.hostname);
} catch { /* Missing/invalid origin is a launch blocker. */ }
const report = {
  projectRef: ref,
  turnstileConfigured: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
    && !/^[123]x0{10}/.test(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""),
  validPublicOrigin: validOrigin,
  cronSecretConfigured: (process.env.CRON_SECRET || "").length >= 32,
  aiEncryptionKeyConfigured: (process.env.AI_SETTINGS_ENCRYPTION_KEY || "").length >= 32,
  uploadSecretConfigured: (process.env.CV_TOKEN_SECRET || process.env.AI_SETTINGS_ENCRYPTION_KEY || "").length >= 32,
};
const blockers = Object.entries(report).filter(([name,value]) => name !== "projectRef" && value === false).map(([name]) => name);
// Print configuration checks even if database TLS fails later. Never print values.
console.log(JSON.stringify({ configuration: report }, null, 2));
const connection = new URL(dbUrl);
if (!connection.hostname.includes(ref) && !decodeURIComponent(connection.username).includes(ref)) throw new Error("Database URL does not match the configured Supabase project.");
// Download the CA from the project's Database settings, never turn TLS checks off.
const ca = process.env.SUPABASE_DB_CA_FILE ? readFileSync(process.env.SUPABASE_DB_CA_FILE, "utf8") : undefined;
// pg connection-string ssl options otherwise replace the verified TLS object.
for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) connection.searchParams.delete(parameter);
const client = new pg.Client({ connectionString: connection.toString(), connectionTimeoutMillis: 10000, statement_timeout: 15000, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });
try {
  await client.connect();
  const tables = await client.query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename");
  const schema = await client.query(`select column_name from information_schema.columns where table_schema='public' and table_name='User' and column_name='authId'`);
  const staffAuth = await client.query(`select role,
    count(*) filter (where "authId" is not null) as linked,
    count(*) as total
    from public."User" where role in ('admin','recruiter','reviewer') group by role`);
  const grants = await client.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`);
  const runtimeAccess = runtimePrivilegeErrors((await client.query(runtimePrivilegeQuery)).rows);
  const role = await client.query(`select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls,
    exists(select 1 from pg_tables where schemaname='public' and tableowner=current_user) as owns_portal_tables
    from pg_roles where rolname=current_user`);
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publicKey }, signal: AbortSignal.timeout(10000) });
  const settings = await response.json();
  const linkedStaff = Object.fromEntries(staffAuth.rows.map(row => [row.role, Number(row.linked)]));
  const database = { projectRef: ref, databaseConnected: true, hasAuthMapping: schema.rowCount === 1,
    hasRateLimitTable: tables.rows.some((r) => r.tablename === "AuthRateLimit"),
    hasLinkedAdmin: (linkedStaff.admin || 0) > 0,
    hasLinkedRecruiter: (linkedStaff.recruiter || 0) > 0,
    hasLinkedReviewer: (linkedStaff.reviewer || 0) > 0,
    tablesWithoutRls: tables.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename), browserTableGrants: grants.rows,
    authSettingsReadable: response.ok, emailAutoConfirm: settings.mailer_autoconfirm === true,
    directSelfSignupDisabled: settings.disable_signup === true,
    runtimePrivilegeErrors: runtimeAccess,
    leastPrivilegeConnection: Boolean(role.rows[0] && !role.rows[0].rolsuper && !role.rows[0].rolcreatedb
      && !role.rows[0].rolcreaterole && !role.rows[0].rolbypassrls && !role.rows[0].owns_portal_tables),
  };
  console.log(JSON.stringify(database, null, 2));
  for (const [name,value] of Object.entries(database)) if (value === false || Array.isArray(value) && value.length > 0) blockers.push(name);
} catch (error) {
  // Never dump database connection strings or provider response bodies.
  console.error("Launch preflight failed:", error?.code || error?.name || "connection error");
  process.exitCode = 1;
} finally { await client.end(); }
if (blockers.length) {
  console.error("Launch blocked:", blockers.join(", "));
  process.exitCode = 1;
}
