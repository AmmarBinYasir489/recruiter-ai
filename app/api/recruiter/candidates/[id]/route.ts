import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCandidateView } from "@/lib/candidateView";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !["recruiter", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const view = await getCandidateView(id, user);
  // Ownership failures deliberately look identical to missing records.
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ view }, { headers: { "Cache-Control": "private, no-store" } });
}
