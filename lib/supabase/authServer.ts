import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAuthConfig } from "./authConfig";

export async function getSupabaseAuth() {
  const cookieStore = await cookies();
  const { url, key } = supabaseAuthConfig();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; middleware refreshes them. */ }
      },
    },
  });
}
