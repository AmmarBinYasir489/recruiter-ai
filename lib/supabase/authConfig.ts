export function useSupabaseAuth(): boolean {
  // The local adapter is exclusively for isolated tests/offline development.
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_PROVIDER === "local") return false;
  return true;
}

export function supabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase Auth configuration is incomplete.");
  return { url, key };
}
