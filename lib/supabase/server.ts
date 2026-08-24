import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function serverKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function projectUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

export function isSupabaseConfigured() {
  if (process.env.NODE_ENV === "test" || process.env.SUPABASE_STORAGE_DISABLED === "true") return false;
  return Boolean(projectUrl() && serverKey());
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = projectUrl();
  const key = serverKey();
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  if (!client) {
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export function cvBucketName() {
  return process.env.SUPABASE_CV_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "candidate-cvs";
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return { configured: false, connected: false, message: "Not configured" };
  try {
    const { error } = await getSupabaseAdmin().storage.listBuckets();
    if (error) throw error;
    return { configured: true, connected: true, message: "Connected" };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
