import { enabledStages, type Funnel, type AutomaticStageTransition } from "@/lib/engine/funnel";

export function isOnsiteTrack(trackKey?: string | null) { return Boolean(trackKey?.startsWith("ONSITE:")); }
export function trackLabel(name: string, trackKey?: string | null) { return `${name}${isOnsiteTrack(trackKey) ? " · Onsite" : ""}`; }

// Determine the next test when staff explicitly approves an onsite phase.
// CV is reused; invitation-only stages are not tests; hiring remains manual.
export function onsiteNext(funnel: Funnel, afterType?: string): AutomaticStageTransition {
  const stages = enabledStages(funnel).filter((stage) => !["CV_SCREENING", "ONSITE", "FINAL"].includes(stage.type));
  const index = afterType ? stages.findIndex((stage) => stage.type === afterType) : -1;
  const next = afterType && index < 0 ? undefined : stages[index + 1];
  if (!next) return { currentStage: "FINAL", phaseReleased: false, applicationStatus: "HOLD" };
  const scheduled = Boolean(next.opensAt && new Date(next.opensAt).getTime() > Date.now());
  return { currentStage: next.type, phaseReleased: true, applicationStatus: "IN_PROGRESS", nextStageName: next.name || next.type };
}

export function onsiteUpdateMessage(next: AutomaticStageTransition) {
  return next.currentStage === "FINAL"
    ? "Your onsite assessments are complete. Results are awaiting review and a final decision from the recruitment team."
    : next.phaseReleased ? `Submission received. Your next onsite assessment, ${next.nextStageName}, is now available.`
      : `Submission received. Your next onsite assessment, ${next.nextStageName}, will open at its scheduled time.`;
}
