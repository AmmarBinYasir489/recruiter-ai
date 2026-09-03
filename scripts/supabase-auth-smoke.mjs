import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--run")) throw new Error("Use --run to create and remove one isolated Supabase test identity. No application data is changed.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secret || !publicKey) throw new Error("Supabase configuration missing.");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, options);
const client = createClient(url, publicKey, options);
const email = `qa-auth-${randomUUID()}@example.com`;
const password = randomBytes(24).toString("base64url");
let authId;
let step = "create";
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { purpose: "isolated-public-launch-auth-test" } });
  if (created.error || !created.data.user) throw new Error("create failed");
  authId = created.data.user.id;
  step = "sign-in";
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== authId) throw new Error("sign-in failed");
  step = "get-user";
  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== authId) throw new Error("validation failed");
  step = "refresh";
  if ((await client.auth.refreshSession()).error) throw new Error("refresh failed");
  step = "sign-out";
  if ((await client.auth.signOut()).error) throw new Error("sign-out failed");
  console.log(JSON.stringify({ projectRef: new URL(url).hostname.split(".")[0], create: true, signIn: true, tokenValidation: true, refresh: true, signOut: true }));
} catch {
  console.error(`Supabase Auth smoke failed at ${step}; credentials were not logged.`);
  process.exitCode = 1;
} finally {
  if (authId) {
    const cleanup = await admin.auth.admin.deleteUser(authId);
    console.log(JSON.stringify({ testIdentityRemoved: !cleanup.error }));
    if (cleanup.error) { console.error("Remove isolated test identity manually:", authId); process.exitCode = 1; }
  }
}
