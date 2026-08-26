import { getCurrentUser } from "@/lib/auth";
import { getCandidateView } from "@/lib/candidateView";
import { CandidateWorkspace } from "@/components/candidate/CandidateWorkspace";

export const dynamic = "force-dynamic";

export default async function CandidateDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  const view = await getCandidateView(params.id, user);
  if (!view) return <div className="card">Application not found.</div>;
  return <CandidateWorkspace view={view} />;
}
