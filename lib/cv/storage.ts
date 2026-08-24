import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cvBucketName, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const SUPABASE_PREFIX = "supabase://";
export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

function safeName(fileName: string) {
  const cleaned = path.basename(fileName).replace(/[^\w.\-]/g, "_");
  return cleaned || "resume.bin";
}

async function ensurePrivateBucket() {
  const client = getSupabaseAdmin();
  const bucket = cvBucketName();
  const { data, error } = await client.storage.getBucket(bucket);
  if (data && !error) return bucket;
  const { error: createError } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: MAX_CV_BYTES,
    allowedMimeTypes: ALLOWED_CV_TYPES,
  });
  if (createError && !/already exists/i.test(createError.message)) throw createError;
  return bucket;
}

export async function deleteStoredCv(storagePath: string): Promise<void> {
  if (!storagePath.startsWith(SUPABASE_PREFIX)) {
    await fs.promises.rm(storagePath, { force: true });
    return;
  }
  const location = storagePath.slice(SUPABASE_PREFIX.length);
  const slash = location.indexOf("/");
  if (slash < 1) return;
  const bucket = location.slice(0, slash);
  const objectPath = location.slice(slash + 1);
  await getSupabaseAdmin().storage.from(bucket).remove([objectPath]);
}

export async function storeCvFile(appId: string, fileName: string, mime: string, buf: Buffer): Promise<string> {
  if (isSupabaseConfigured()) {
    const bucket = await ensurePrivateBucket();
    const objectPath = `applications/${appId}/${crypto.randomUUID()}-${safeName(fileName)}`;
    const { error } = await getSupabaseAdmin().storage.from(bucket).upload(objectPath, buf, {
      contentType: mime || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    return `${SUPABASE_PREFIX}${bucket}/${objectPath}`;
  }

  const dir = path.join(process.cwd(), "uploads", appId);
  await fs.promises.mkdir(dir, { recursive: true });
  const full = path.join(dir, `${crypto.randomUUID()}-${safeName(fileName)}`);
  await fs.promises.writeFile(full, buf);
  return full;
}

export async function readCvFile(storagePath: string): Promise<Buffer> {
  if (!storagePath.startsWith(SUPABASE_PREFIX)) return fs.promises.readFile(storagePath);
  const location = storagePath.slice(SUPABASE_PREFIX.length);
  const slash = location.indexOf("/");
  if (slash < 1) throw new Error("Invalid Supabase CV storage path.");
  const bucket = location.slice(0, slash);
  const objectPath = location.slice(slash + 1);
  const { data, error } = await getSupabaseAdmin().storage.from(bucket).download(objectPath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
