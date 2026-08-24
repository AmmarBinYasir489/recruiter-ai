import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const expectedProject = "lvmnqpsfussgfizxvhpf";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const projectRef = url ? new URL(url).hostname.split(".")[0] : "";
if (projectRef !== expectedProject) throw new Error(`Unexpected Supabase project: ${projectRef || "missing"}`);
if (!key) throw new Error("Supabase server secret is missing.");

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const buckets = [
  {
    id: process.env.SUPABASE_CV_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "candidate-resumes",
    options: {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
    },
  },
  {
    id: process.env.SUPABASE_ASSESSMENT_BUCKET || "assessment-recordings",
    options: {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4"],
    },
  },
];

const { data: existing, error: listError } = await supabase.storage.listBuckets();
if (listError) throw listError;
const existingIds = new Set(existing.map((bucket) => bucket.id));

for (const bucket of buckets) {
  const result = existingIds.has(bucket.id)
    ? await supabase.storage.updateBucket(bucket.id, bucket.options)
    : await supabase.storage.createBucket(bucket.id, bucket.options);
  if (result.error) throw new Error(`Could not configure bucket ${bucket.id}: ${result.error.message}`);
}

console.log(JSON.stringify({ ok: true, projectRef, privateBuckets: buckets.map((bucket) => bucket.id) }));
