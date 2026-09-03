"use client";

import { useMemo, useRef, useState } from "react";
import { createDriveAction } from "@/app/recruiter/actions";
import { suggestDriveSkillsAction } from "@/app/recruiter/skillActions";
import { Card, LinkButton } from "@/components/ui";

const PHASES = [
  { type: "CV_SCREENING", name: "CV screening", enabled: true, locked: true, passScore: 60, durationMin: 0 },
  { type: "CCAT", name: "CCAT / IQ", enabled: true, passScore: 55, durationMin: 20 },
  { type: "MTT", name: "Math Thinking Test", enabled: true, passScore: 55, durationMin: 20 },
  { type: "GAMES", name: "Games", enabled: false, passScore: 70, durationMin: 20 },
  { type: "CODING", name: "Coding", enabled: true, passScore: 65, durationMin: 45 },
  { type: "ESSAY", name: "Essay", enabled: true, passScore: 60, durationMin: 30 },
  { type: "PROMPT", name: "Prompt engineering", enabled: true, passScore: 65, durationMin: 20 },
  { type: "ENGLISH_SPEAKING", name: "English speaking", enabled: false, passScore: 60, durationMin: 15 },
  { type: "ONSITE", name: "Onsite screening", enabled: false, passScore: 0, durationMin: 0 },
  { type: "FINAL", name: "Final decision", enabled: true, locked: true, passScore: 0, durationMin: 0 },
] as const;

type PhaseState = { type: string; name: string; enabled: boolean; locked?: boolean; passScore: number; durationMin: number };

export function DriveCreationForm({ today, backHref }: { today: string; backHref: string }) {
  const [title, setTitle] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [skillMessage, setSkillMessage] = useState("");
  const lastSuggestedTitle = useRef("");
  async function suggestSkills() {
    if (suggesting) return;
    lastSuggestedTitle.current = title;
    setSuggesting(true);
    setSkillMessage("");
    try {
      const result = await suggestDriveSkillsAction(title);
      if ("error" in result) { setSkillMessage(result.error || "Suggestions unavailable."); return; }
      setRequiredSkills(result.required.join(", "));
      setPreferredSkills(result.preferred.join(", "));
      setSkillMessage("AI draft ready. Review, add or remove skills before creating the drive.");
    } catch { setSkillMessage("Unable to request suggestions. You can still enter skills manually."); }
    finally { setSuggesting(false); }
  }
  const [withDefaultFunnel, setWithDefaultFunnel] = useState(true);
  const [phases, setPhases] = useState<PhaseState[]>(PHASES.map((phase) => ({ ...phase })));
  const configuredStages = useMemo(() => phases.filter((phase) => phase.enabled).map((phase, index) => ({
    type: phase.type,
    name: phase.name,
    enabled: true,
    order: index + 1,
    passScore: phase.passScore,
    durationMin: phase.durationMin,
    gradingMode: ["CV_SCREENING", "CCAT", "MTT"].includes(phase.type) ? "AUTO" : ["CODING", "ESSAY", "PROMPT", "ENGLISH_SPEAKING"].includes(phase.type) ? "MANUAL" : "AUTO",
    passAction: "NEXT",
    failAction: phase.type === "CV_SCREENING" ? "HOLD" : "REJECT",
  })), [phases]);

  return <>
    <Card>
      <form action={createDriveAction} className="space-y-5">
        <div>
          <label className="label" htmlFor="drive-name">Title</label>
          <input id="drive-name" name="name" className="input" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim().length >= 3 && title !== lastSuggestedTitle.current && !requiredSkills && !preferredSkills) void suggestSkills(); }} disabled={suggesting} aria-describedby="drive-title-help" placeholder="AI Engineer — August 2026" />
          <p id="drive-title-help" className="mt-1 text-xs text-slate-500">After entering a title, AI drafts skills if both lists are empty. Your existing edits are never replaced automatically.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="drive-location">Location</label>
            <input id="drive-location" name="location" className="input" placeholder="Islamabad, PK" />
          </div>
          <div>
            <label className="label" htmlFor="drive-deadline">Application deadline</label>
            <input id="drive-deadline" name="deadline" type="date" className="input" min={today} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="drive-description">Job description</label>
          <textarea id="drive-description" name="jobDescription" className="input" rows={5} required placeholder="Describe the role and required skills (Python, ML, ...)" />
          <p className="mt-1 text-xs text-slate-500">Set the exact CV matching criteria below. Job description provides context.</p>
        </div>
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4" disabled={suggesting}>
          <legend className="px-1 font-semibold">Skills for CV matching</legend>
          <button type="button" className="btn-outline" disabled={suggesting || title.trim().length < 3} onClick={suggestSkills}>{suggesting ? "Suggesting skills…" : "Suggest skills from job title"}</button>
          <p className="text-sm text-slate-600">AI uses the provider selected by your admin. Suggestions are editable, not mandatory. Separate skills with commas; remove any that do not apply.</p>
          <div><label className="label" htmlFor="required-skills">Required skills</label><textarea id="required-skills" name="requiredSkills" className="input" rows={2} value={requiredSkills} onChange={(event) => setRequiredSkills(event.target.value)} placeholder="React, JavaScript, HTML, CSS" /></div>
          <div><label className="label" htmlFor="preferred-skills">Preferred skills</label><textarea id="preferred-skills" name="preferredSkills" className="input" rows={2} value={preferredSkills} onChange={(event) => setPreferredSkills(event.target.value)} placeholder="TypeScript, Next.js" /></div>
        </fieldset>
        <p role="status" className="text-sm text-slate-600">{suggesting ? "Generating an editable skill draft…" : skillMessage}</p>
        <div>
          <label className="label" htmlFor="drive-cv-threshold">CV pass threshold (0–100)</label>
          <input id="drive-cv-threshold" name="cvPassThreshold" type="number" min={0} max={100} defaultValue={60} className="input w-32" />
          <p className="mt-1 text-xs text-slate-400">Candidates remain held after CV scoring until recruitment staff release an assessment funnel.</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="default-funnel-heading">
          <label className="flex cursor-pointer items-start gap-3">
            <input name="createDefaultFunnel" type="checkbox" className="mt-1" checked={withDefaultFunnel} onChange={(event) => setWithDefaultFunnel(event.target.checked)} />
            <span>
              <span id="default-funnel-heading" className="block font-semibold text-ink-900">Create a default funnel for this drive</span>
              <span className="mt-1 block text-xs text-slate-500">New applicants are placed in this funnel. Tests are still released by recruitment staff, and candidates can be moved to another funnel before testing starts.</span>
            </span>
          </label>

          {withDefaultFunnel && <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
            <div>
              <label className="label" htmlFor="default-funnel-name">Default funnel name</label>
              <input id="default-funnel-name" name="defaultFunnelName" className="input" defaultValue="Default Funnel" required />
            </div>
            <fieldset>
              <legend className="label">Default phases</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {phases.map((phase, index) => <label key={phase.type} className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm ${phase.enabled ? "border-brand-200" : "border-slate-200 text-slate-500"}`}>
                  <input
                    type="checkbox"
                    checked={phase.enabled}
                    disabled={phase.locked}
                    onChange={(event) => setPhases((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))}
                  />
                  <span>{phase.name}</span>
                  {phase.locked && <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">Required</span>}
                </label>)}
              </div>
              <p className="mt-2 text-xs text-slate-400">Thresholds and detailed routing can be edited from the funnel page after creation.</p>
            </fieldset>
          </div>}
        </section>

        <input type="hidden" name="defaultFunnelStages" value={withDefaultFunnel ? JSON.stringify(configuredStages) : "[]"} />
        <button className="btn-primary w-full" disabled={suggesting}>{withDefaultFunnel ? "Create drive with default funnel" : "Create drive"}</button>
      </form>
    </Card>
    <div className="mt-4"><LinkButton href={backHref} className="btn-ghost">← Back to drives</LinkButton></div>
  </>;
}
