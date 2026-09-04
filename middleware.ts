import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthConfig, useSupabaseAuth } from "@/lib/supabase/authConfig";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Never cache authenticated HTML or server-action responses.
  response.headers.set("Cache-Control", "private, no-store");
  if (!useSupabaseAuth()) return response;
  let config;
  try { config = supabaseAuthConfig(); }
  catch { return response; } // Protected server pages still fail closed.
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, cacheHeaders) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Verify the token without trusting cookie-backed session.user. With modern
  // asymmetric Supabase signing keys this uses cached JWKS and is materially
  // faster than an Auth-server round trip on every navigation.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/internal|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
