import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--run")) throw new Error("Use --run to upload/read/remove one temporary probe in the private CV bucket.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_CV_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "candidate-cvs";
if (!url || !key) throw new Error("Supabase configuration missing");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const object = `qa-public-launch/${randomUUID()}/probe.txt`;
let uploaded = false;
let step = "private-bucket";
try {
  const check = await client.storage.getBucket(bucket);
  if (check.error || !check.data || check.data.public) throw new Error("Private bucket required");
  step = "signed-url";
  const signed = await client.storage.from(bucket).createSignedUploadUrl(object, { upsert: false });
  if (signed.error || !signed.data) throw new Error("signed URL failed");
  step = "upload";
  const text = "Temporary private upload verification. No candidate information.";
  const put = await fetch(signed.data.signedUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: text, signal: AbortSignal.timeout(15000) });
  if (!put.ok) throw new Error("upload failed");
  uploaded = true;
  step = "download";
  const downloaded = await client.storage.from(bucket).download(object);
  if (downloaded.error || await downloaded.data.text() !== text) throw new Error("download mismatch");
  step = "public-denial";
  const publicResponse = await fetch(`${url}/storage/v1/object/public/${bucket}/${object}`, { signal: AbortSignal.timeout(15000) });
  if (publicResponse.ok) throw new Error("private object publicly accessible");
  console.log(JSON.stringify({ privateBucket: true, signedUpload: true, serverDownload: true, anonymousDownloadBlocked: true }));
} catch {
  console.error(`Storage smoke failed at ${step}; no keys or upload URLs were logged.`);
  process.exitCode = 1;
} finally {
  // Remove the exact test object even after an ambiguous upload network failure.
  const removed = await client.storage.from(bucket).remove([object]);
  console.log(JSON.stringify({ temporaryObjectRemoved: !removed.error, uploaded }));
  if (removed.error) { console.error("Test-only object requires cleanup:", `${bucket}/${object}`); process.exitCode = 1; }
}
