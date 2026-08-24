import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSupabaseConnection } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  const supabase = await checkSupabaseConnection();
  const ok = database && (!supabase.configured || supabase.connected);
  return NextResponse.json(
    { ok, database, supabase: { configured: supabase.configured, connected: supabase.connected } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
