import nextEnv from "@next/env";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--run")) throw new Error("Use --run to create and remove one disposable Auth identity. No resumes or application records are used.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secret || !publicKey) throw new Error("Supabase configuration missing.");
if (new URL(url).hostname !== "lvmnqpsfussgfizxvhpf.supabase.co") throw new Error("Unexpected test project.");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, options);
const client = createClient(url, publicKey, options);
const email = `qa-security-${randomUUID()}@example.com`;
let password = randomBytes(24).toString("base64url");
let authId;
let step = "create";
const passed = [];
function assert(value) { if (!value) throw new Error("check failed"); }
function totp(secret) {
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const index = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP key");
    bits += index.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(byte => parseInt(byte, 2)));
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(time).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
async function recover(mfa) {
  // Admin-generated code is used only for this newly created identity. No email
  // is sent and no real account/password is inspected or modified.
  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  assert(!link.error && link.data.properties.email_otp);
  const code = link.data.properties.email_otp;
  const verified = await client.auth.verifyOtp({ email, token: code, type: "recovery" });
  assert(!verified.error && verified.data.user?.id === authId);
  const replay = await createClient(url, publicKey, options).auth.verifyOtp({ email, token: code, type: "recovery" });
  assert(Boolean(replay.error));
  if (mfa) {
    // A fresh time step avoids authenticator replay rejection.
    await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    const challenged = await client.auth.mfa.challengeAndVerify({ factorId: mfa.id, code: totp(mfa.secret) });
    assert(!challenged.error);
  }
  password = randomBytes(24).toString("base64url");
  assert(!(await client.auth.updateUser({ password })).error);
  assert(!(await client.auth.signOut({ scope: "global" })).error);
  assert(!(await client.auth.signInWithPassword({ email, password })).error);
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { purpose: "isolated-security-smoke" } });
  assert(!created.error && created.data.user);
  authId = created.data.user.id;
  assert(!(await client.auth.signInWithPassword({ email, password })).error);
  step = "recovery-and-replay";
  await recover(); passed.push(step);
  step = "mfa-enrollment";
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", issuer: "Portal QA" });
  assert(!enrolled.error && enrolled.data);
  const factor = { id: enrolled.data.id, secret: enrolled.data.totp.secret };
  const code = totp(factor.secret);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  assert(Boolean((await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: wrong })).error));
  assert(!(await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code })).error);
  assert((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel === "aal2");
  passed.push(step);
  step = "mfa-password-recovery";
  await client.auth.signOut({ scope: "local" });
  await recover(factor); passed.push(step);
  assert((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel === "aal1");
  assert((await client.auth.mfa.listFactors()).data?.totp.some(item => item.id === factor.id));
  passed.push("password-signin-does-not-bypass-mfa");
  console.log(JSON.stringify({ projectRef: "lvmnqpsfussgfizxvhpf", passed }));
} catch {
  console.error("Supabase security smoke failed at", step, "(credentials were not logged).");
  process.exitCode = 1;
} finally {
  await client.auth.signOut({ scope: "global" }).catch(() => {});
  if (authId) {
    const deleted = await admin.auth.admin.deleteUser(authId);
    console.log(JSON.stringify({ testIdentityRemoved: !deleted.error }));
    if (deleted.error) { console.error("Remove only the isolated test identity:", authId); process.exitCode = 1; }
  }
}
