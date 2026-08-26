import type { Decision, GradingMode, StageType } from "./types";
export type { StageType } from "./types";

// Funnel / stage model. A funnel is an ordered list of stages for a drive.
// Published funnels are versioned and immutable; threshold changes do NOT mutate
// the pipeline version.

export interface FunnelStage {
  id: string;
  type: StageType;
  name: string;
  order: number;
  enabled?: boolean; // false => phase excluded from this funnel's journey
  gradingMode?: GradingMode; // for assessments: AUTO / MANUAL / AUTO_APPROVAL
  passScore?: number; // required pass percentage for the stage
  durationMin?: number;
  opensAt?: string; // optional ISO timestamp; assignment stays locked until then
  deadline?: string;
  passAction?: "NEXT" | "ADVANCE_TO" | "OFFER";
  failAction?: "REJECT" | "HOLD" | "MOVE_TO";
  passTargetStageId?: string;
  failTargetStageId?: string;
  assignedRecruiters?: string[];
  assignedReviewers?: string[];
}

export interface Funnel {
  id: string;
  driveId: string;
  version: number;
  published: boolean;
  stages: FunnelStage[];
}

export type StageOutcome = "PASS" | "FAIL" | "SKIP" | "PENDING";

// Determine the outcome of a completed stage given its result + config.
export function evaluateStageOutcome(stage: FunnelStage, normalizedScore: number): StageOutcome {
  const threshold = stage.passScore ?? 0;
  if (normalizedScore >= threshold) return "PASS";
  return "FAIL";
}

export interface RoutingResult {
  outcome: StageOutcome;
  nextStageId?: string; // stage to move to
  finalDecision?: Decision; // OFFER / REJECT when terminal
}

// Route an application after a stage outcome.
export function routeStage(funnel: Funnel, stageId: string, outcome: StageOutcome): RoutingResult {
  const idx = funnel.stages.findIndex((s) => s.id === stageId);
  if (idx === -1) return { outcome, nextStageId: undefined };
  const stage = funnel.stages[idx];

  if (outcome === "SKIP") {
    const next = funnel.stages[idx + 1];
    return { outcome, nextStageId: next?.id };
  }
  if (outcome === "FAIL") {
    const action = stage.failAction ?? "REJECT";
    if (action === "REJECT") return { outcome, finalDecision: "FAIL" };
    if (action === "MOVE_TO" && stage.failTargetStageId) {
      return { outcome, nextStageId: stage.failTargetStageId };
    }
    return { outcome, finalDecision: "FAIL" }; // HOLD -> stay (no move)
  }
  // PASS
  const action = stage.passAction ?? "NEXT";
  if (action === "OFFER") return { outcome, finalDecision: "PASS" };
  if (action === "ADVANCE_TO" && stage.passTargetStageId) {
    return { outcome, nextStageId: stage.passTargetStageId };
  }
  const next = funnel.stages[idx + 1];
  return { outcome, nextStageId: next?.id };
}

// ---- Funnel phase configuration helpers ----

export function findStage(funnel: Funnel, type?: string | null, id?: string): FunnelStage | undefined {
  if (id) return funnel.stages.find((s) => s.id === id);
  if (type) return funnel.stages.find((s) => s.type === type);
  return undefined;
}

// Only stages that are enabled (default true) are part of the journey.
export function enabledStages(funnel: Funnel): FunnelStage[] {
  return funnel.stages
    .filter((s) => s.enabled !== false && s.type !== "MANUAL_REVIEW")
    .slice()
    .sort((a, b) => a.order - b.order);
}

// Threshold configured for a given phase type within a funnel.
export function phaseThreshold(funnel: Funnel, type: StageType): number {
  const stage = findStage(funnel, type);
  return stage?.passScore ?? 0;
}

// The next ENABLED stage after the given stage (by id or type). Returns
// undefined when there is no further stage (terminal).
export function nextEnabledStage(
  funnel: Funnel,
  after: { type?: StageType; id?: string },
): FunnelStage | undefined {
  const stages = enabledStages(funnel);
  const idx = stages.findIndex((s) => (after.id ? s.id === after.id : s.type === after.type));
  if (idx === -1) return undefined;
  return stages[idx + 1];
}

// CV screening happens in the drive intake pool before funnel assignment.
// When staff selects a funnel, release the first enabled post-CV stage (or the
// first non-CV stage for a custom funnel that omits CV).
export function firstAssessmentStage(funnel: Funnel): FunnelStage | undefined {
  const stages = enabledStages(funnel);
  const cvIndex = stages.findIndex((stage) => stage.type === "CV_SCREENING");
  return (cvIndex >= 0 ? stages.slice(cvIndex + 1) : stages).find((stage) => stage.type !== "CV_SCREENING");
}

export interface AutomaticStageTransition {
  applicationStatus: "IN_PROGRESS" | "REJECTED" | "OFFERED" | "HOLD";
  currentStage: StageType;
  phaseReleased: boolean;
  nextStageName?: string;
}

// Applies a published funnel's routing rules after an automatically graded
// phase. It never bypasses disabled stages and keeps HOLD outcomes locked.
export function automaticStageTransition(
  funnel: Funnel,
  stageType: StageType,
  outcome: "PASS" | "FAIL",
): AutomaticStageTransition {
  const stage = findStage(funnel, stageType);
  if (!stage) return { applicationStatus: "HOLD", currentStage: stageType, phaseReleased: false };

  if (outcome === "FAIL") {
    if (stage.failAction === "MOVE_TO" && stage.failTargetStageId) {
      const target = findStage(funnel, null, stage.failTargetStageId);
      if (target && target.enabled !== false) {
        if (target.type === "ONSITE") return { applicationStatus: "HOLD", currentStage: "ONSITE", phaseReleased: false, nextStageName: target.name };
        return { applicationStatus: "IN_PROGRESS", currentStage: target.type, phaseReleased: true, nextStageName: target.name };
      }
    }
    return {
      applicationStatus: stage.failAction === "HOLD" ? "HOLD" : "REJECTED",
      currentStage: stageType,
      phaseReleased: false,
    };
  }

  if (stage.passAction === "OFFER") {
    return { applicationStatus: "OFFERED", currentStage: stageType, phaseReleased: false };
  }
  if (stage.passAction === "ADVANCE_TO" && stage.passTargetStageId) {
    const target = findStage(funnel, null, stage.passTargetStageId);
    if (target && target.enabled !== false) {
      if (target.type === "ONSITE") return { applicationStatus: "HOLD", currentStage: "ONSITE", phaseReleased: false, nextStageName: target.name };
      return { applicationStatus: "IN_PROGRESS", currentStage: target.type, phaseReleased: true, nextStageName: target.name };
    }
  }
  const next = nextEnabledStage(funnel, { id: stage.id });
  if (next) {
    if (next.type === "ONSITE") {
      return { applicationStatus: "HOLD", currentStage: "ONSITE", phaseReleased: false, nextStageName: next.name };
    }
    if (next.type === "FINAL") {
      return { applicationStatus: "HOLD", currentStage: "FINAL", phaseReleased: false, nextStageName: next.name };
    }
    return { applicationStatus: "IN_PROGRESS", currentStage: next.type, phaseReleased: true, nextStageName: next.name };
  }
  return { applicationStatus: "HOLD", currentStage: stageType, phaseReleased: false };
}
