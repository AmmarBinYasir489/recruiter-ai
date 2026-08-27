import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const sourcePath = resolve(process.argv[2] || "../recruitment-portal-v2/.env");
const targetPath = resolve(".env");
const backupPath = resolve(".env.backup-before-v2");
const schema = process.argv[3] || "public";

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function withSchema(raw, mode) {
  if (!raw) throw new Error(`Missing ${mode} Supabase database URL in source environment.`);
  const url = new URL(raw);
  url.searchParams.set("schema", schema);
  if (mode === "runtime") {
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("statement_cache_size", "0");
    url.searchParams.set("connection_limit", "5");
  } else {
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("statement_cache_size");
    url.searchParams.set("connection_limit", "1");
  }
  return url.toString();
}

function projectRef(url) {
  return new URL(url).hostname.split(".")[0];
}

const sourceText = readFileSync(sourcePath, "utf8");
const targetText = readFileSync(targetPath, "utf8");
const source = parseEnv(sourceText);
const target = parseEnv(targetText);

const publicUrl = source.get("NEXT_PUBLIC_SUPABASE_URL") || source.get("SUPABASE_URL");
const serverUrl = source.get("SUPABASE_URL") || publicUrl;
const runtimeUrl = source.get("SUPABASE_DATABASE_URL") || source.get("DATABASE_URL");
const directUrl = source.get("SUPABASE_DIRECT_URL") || (() => {
  const url = new URL(runtimeUrl);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") url.port = "5432";
  return url.toString();
})();
const serviceKey = source.get("SUPABASE_SECRET_KEY") || source.get("SUPABASE_SERVICE_ROLE_KEY");
const existingSeedPassword = target.get("PORTAL_SEED_PASSWORD") || "";
const sourceAdminPassword = source.get("ADMIN_PASSWORD") || "";
const seedPassword = existingSeedPassword.length >= 12
  ? existingSeedPassword
  : sourceAdminPassword.length >= 12
    ? sourceAdminPassword
    : randomBytes(24).toString("base64url");
if (!publicUrl || !serverUrl || !runtimeUrl || !directUrl || !serviceKey) {
  throw new Error("The source portal is missing one or more required Supabase settings.");
}
if (projectRef(publicUrl) !== "lvmnqpsfussgfizxvhpf") {
  throw new Error("The source portal no longer points to the expected linked Supabase project.");
}

const updates = new Map([
  ["NEXT_PUBLIC_SUPABASE_URL", publicUrl],
  ["SUPABASE_URL", serverUrl],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", source.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") || ""],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["SUPABASE_SECRET_KEY", serviceKey],
  ["SUPABASE_DATABASE_URL", withSchema(runtimeUrl, "runtime")],
  ["SUPABASE_DIRECT_URL", withSchema(directUrl, "direct")],
  ["SUPABASE_STORAGE_BUCKET", "candidate-resumes-new"],
  ["SUPABASE_CV_BUCKET", "candidate-resumes-new"],
  ["SUPABASE_ASSESSMENT_BUCKET", "assessment-recordings"],
  ["CRON_SECRET", source.get("CRON_SECRET") || target.get("CRON_SECRET") || randomBytes(32).toString("base64url")],
  ["CV_WORKER_SECRET", source.get("CRON_SECRET") || target.get("CV_WORKER_SECRET") || randomBytes(32).toString("base64url")],
  ["AI_SETTINGS_ENCRYPTION_KEY", target.get("AI_SETTINGS_ENCRYPTION_KEY") || randomBytes(32).toString("base64url")],
  ["PORTAL_SEED_PASSWORD", seedPassword],
]);

for (const key of ["GEMINI_API_KEY", "GEMINI_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "OPENAI_API_KEY", "OPENAI_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL"]) {
  if (source.get(key)) updates.set(key, source.get(key));
}

if (!existsSync(backupPath)) copyFileSync(targetPath, backupPath);
const seen = new Set();
const output = targetText.split(/\r?\n/).map((line) => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  if (!match || !updates.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${JSON.stringify(updates.get(match[1]))}`;
});
for (const [key, value] of updates) {
  if (!seen.has(key)) output.push(`${key}=${JSON.stringify(value)}`);
}
writeFileSync(targetPath, `${output.join("\n").replace(/\n+$/, "")}\n`, "utf8");

console.log(JSON.stringify({ ok: true, projectRef: projectRef(publicUrl), schema, backup: ".env.backup-before-v2" }));
