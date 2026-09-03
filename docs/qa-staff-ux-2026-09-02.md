# Recruiter / admin UI and workflow audit — 2 September 2026

**Follow-up:** the findings below describe the original audit. See [the fix and verification report](qa-ux-fixes-2026-09-02.md) for the implemented corrections and final regression results.

## Verdict

**Not ready for final UX sign-off.** Core flows work, but the issues below need
correction and targeted retesting. No application behavior was changed in this
audit; only QA tests and this report were added. Temporary audit records were
removed; real candidate scores, users and hiring decisions were not modified.

## Coverage and evidence

- Local development server at localhost:3000, Chromium; not a production deployment audit.
- Recruiter: overview, drives, new drive, candidates.
- Admin: overview, drives, new drive, candidates, users, tiers, audit log, AI settings, leaderboards index.
- All 13 routes returned HTTP 200; the navigation sweep recorded no browser page errors.
- Desktop and 390px screenshots inspected. Selected-track layouts also checked at 390, 1280 and 1920px.
- The initial suite completed 15 cases: 11 workflow/auth regression checks and 4 observational audit cases. Passing an observational case means it captured evidence, **not** that the observed UX is correct.
- Separate post-filter/reissue/live-panel follow-ups did not complete. They are not counted as passed.
- TypeScript check passed. Anonymous access to staff CSV endpoint returned 401.
- Temporary drives remaining after cleanup: 0.

## Findings

### P1 — “Add Note” sends potentially internal text to the candidate

**Browser-confirmed.** Entering a temporary note and clicking Add Note created a
`RECRUITER_MSG` notification addressed to the candidate. There was no success
dialog or explicit audience warning. The input cleared after sending.

- [CandidateWorkspace.tsx:593](../components/candidate/CandidateWorkspace.tsx#L593): form calls the notification action.
- [actions.ts:413](../app/recruiter/actions.ts#L413): action delivers the message to the candidate.
- Fix: separate **Internal note — staff only** from **Message candidate**; show audience before sending and an explicit success state.

### P1 — Admin Create User silently discards server errors

**Browser-confirmed.** Submitting the existing admin email produced no visible
“Email already exists” error. The action returns errors, but the form does not
render its result. The successful-create path also lacks explicit success feedback
and list revalidation in the action (code inspection; no new user created here).

- [users/page.tsx:17](../app/admin/users/page.tsx#L17)
- [admin/actions.ts:12](../app/admin/actions.ts#L12)
- Fix: client form action state, inline validation, loading state, success confirmation and list refresh.
- Also default new-user role to candidate, not admin; currently the first option is admin.

### P1 — Candidate list is not usable at narrow widths

**Screenshot-confirmed at 390px.** Nine fixed table columns overlap. Status is
clipped on the right, names wrap into fragments, and headers run into one another.
The document-overflow probe returned false because the container hides overflow;
that is not proof the content fits. Filters occupy roughly two screens before results.

- [CandidateAccordion.tsx:231](../components/candidate/CandidateAccordion.tsx#L231)
- [CandidateAccordion.tsx:382](../components/candidate/CandidateAccordion.tsx#L382)
- [recruiter/candidates/page.tsx:95](../app/recruiter/candidates/page.tsx#L95)
- Fix: mobile candidate cards or a deliberate horizontally scrollable table; collapsible advanced filters with result count and clear-filter action.

### P1 — Open candidate workspaces intentionally stop automatic refresh

**Code-confirmed; runtime update probe not completed.** Opening an accordion sets
`data-auto-refresh-pause=true`. AutoRefresh exits whenever that marker exists.
The detail component has no independent polling loop. This can leave staff viewing
old results while a candidate submits elsewhere. Do not describe this as verified live updating.

- [CandidateAccordion.tsx:228](../components/candidate/CandidateAccordion.tsx#L228)
- [AutoRefresh.tsx:13](../components/AutoRefresh.tsx#L13)
- Fix: refresh read-only detail data separately while preserving selection, scroll,
  expanded section and unsaved edits; show “New result available” when refresh must pause.

### P1 investigation — Interaction after Apply Filters needs a focused reproduction

**Observed, cause unresolved.** The filter request returned the matching candidate
and CSV returned 200, but follow-up runs failed to expose bulk reissue controls or
open the candidate panel after clicks. An initial reissue run had a test-harness
confirmation issue; after accounting for that, the selection/panel interaction still
did not complete. Hydration/navigation timing has not been ruled out.

- Do not label reissue itself broken or working from these runs.
- Retest Apply Filters → wait for interactive UI → Select All → reissue; also filter → open candidate.
- The isolated live-update probe stopped before submitting synthetic data, so no
  browser claim about its final refresh outcome is made.

### P2 — Threshold apply has no success confirmation

**Browser-confirmed.** Threshold changed from 60 to 75 in storage and preview
disappeared, but success dialog count and success-status count were both zero.

- [PhaseThresholdEditor.tsx:47](../components/PhaseThresholdEditor.tsx#L47)
- Fix: show saved threshold, number passed, number held, and whether next assessments were released. Keep it visible near the edited phase and in the centered confirmation pattern.

### P2 — Filter accessibility and reset behavior

**Browser-confirmed.** Each candidate page has 15 visible controls without a
programmatically associated label: search, drive, status, stage, numeric ranges,
and final decision. Visual labels exist but are not connected. Empty state displays
correctly but offers no Clear/Reset filters control.

- [recruiter/candidates/page.tsx:100](../app/recruiter/candidates/page.tsx#L100)
- [admin/candidates/page.tsx:95](../app/admin/candidates/page.tsx#L95)
- Fix: stable input IDs/htmlFor labels; Clear filters action; visible active-filter summary.

### P2 — CSV output does not mirror the new score summary

**Code-confirmed.** CSV exports the older column set and omits provisional total,
graded count, funnel identity and delivery mode. Staff cannot reconstruct the
new online/onsite comparison from the export alone.

- [api/recruiter/candidates/route.ts:68](../app/api/recruiter/candidates/route.ts#L68)
- Fix: an explicitly scoped summary export and a separate per-track/attempt export.

### P3 — Navigation does not identify the current page

**Code and browser DOM confirmed.** No desktop navigation item uses aria-current;
all entries use the same static class. Mobile navigation has the same issue.

- [recruiter/layout.tsx:28](../app/recruiter/layout.tsx#L28)
- [admin/layout.tsx:36](../app/admin/layout.tsx#L36)
- Fix: visible active state and aria-current=page, including nested pages.

## Message placement: what works and what does not

| Action | Observed feedback | Assessment |
| --- | --- | --- |
| Pass selected in phase cohort | Centered modal with dark backdrop; 544×288 at 1280px; focus on Continue; Escape dismisses | Works |
| Candidate CV → CCAT submission → staff approval → MTT | Candidate sees current step/review state; next test appears after approval | Works |
| Assign onsite funnel | Centered confirmation, separate onsite session, online history preserved | Works in regression check |
| Threshold Confirm & Apply | Preview disappears; new value persists; no success message | Needs fix |
| Add Note | Candidate receives notification; no explicit audience or success dialog | Must fix |
| Duplicate admin user | Error returned but not displayed | Must fix |
| Login failure | Inline accessible error with invalid fields | Works |
| Empty candidate search | Empty message shown, no reset action | Partial |

## Verified working

- Recruiter/candidate login sessions and invalid-login feedback; admin login through audit flows.
- CV approval → randomized 80-question CCAT → Hold → applied threshold → MTT release.
- Candidate score/rubric/funnel privacy in that regression flow.
- Expired drive: existing applicant returns to dashboard; new/stale intake blocked.
- Editable drive skills and a successful configured AI skill-draft response.
- Bulk onsite requires a funnel, creates a separate session and keeps original online progress.
- Track switching and same-funnel comparison on recruiter and admin.
- Matching results returned after filtering; staff CSV endpoint responds and rejects anonymous access.

## Limits and next gate

Not verified here: actual invitation email delivery, full fresh-CV OCR/AI grading,
every subjective assessment, production/Supabase rollout, load/concurrency, every
browser, or a complete security/accessibility certification. Route load timings
were roughly 0.7–5.6 seconds in a dev server with cold compilation; they are not
production performance measurements.

Fix P1 issues first, then retest the failed post-filter interaction and user-creation
feedback, threshold confirmations, and mobile table. Do not infer readiness from
unit-test or route-200 counts alone.

Audit method also used the [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
