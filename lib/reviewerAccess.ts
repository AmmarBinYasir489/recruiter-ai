import type { SessionUser } from "@/lib/auth";
import { uj } from "@/lib/db";
import type { FunnelStage } from "@/lib/engine/funnel";

export function reviewerCanGrade(
  user: SessionUser,
  resultType: string,
  funnel: { stages: string } | null | undefined,
) {
  if (user.role.toLowerCase() === "admin") return true;
  if (user.role.toLowerCase() !== "reviewer" || !funnel) return false;
  const stage = (uj<FunnelStage[]>(funnel.stages) || []).find((item) => item.type === resultType && item.enabled !== false);
  return Boolean(stage?.assignedReviewers?.includes(user.id));
}
