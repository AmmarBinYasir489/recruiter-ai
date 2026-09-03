# Staff-controlled assessment workflow

Scoring and progression are separate. CV is scored against extracted, job-relevant
evidence; CCAT/MTT use answer keys; subjective assessments use the configured AI
reviewer when available. An AI failure is an ungraded review, not a zero or a pass.

After submission/scoring, the application remains on Hold at that assessment.
Staff can Hold, Pass, or Fail. Pass releases the next enabled assessment; scheduled
assessments still respect their opening date. Final selection remains a separate
staff decision. These gates apply to online and onsite assessment tracks.

Threshold preview includes only scored candidates waiting at the selected phase.
Confirming approves qualifying candidates and holds the others. Already progressed,
active/reissued, ungraded, and closed applications are excluded. A threshold can be
applied without changing its value. Stale phase actions cannot approve a later phase.

Staff totals are provisional until all enabled, positively weighted assessments are
graded: sum(score × weight) / sum(enabled weights). Missing scores contribute zero
to the provisional total but do not count as graded. Online/onsite scores remain
separate. Candidate screens omit numeric scores, rubric details, internal funnel
names/counts, and application references; pending retests hide old result badges.

The staff workspace has a stable selected-track summary and a separate assignment
row. Its expandable online/onsite comparison is scoped to the same candidate, drive,
and exact funnel. Legacy single-test retests are labeled separately from full onsite
sessions; they are never merged. Stage tiles follow the selected delivery mode while
the stage details retain all historical attempts.

## Question banks and local verification

The restored local pool contains 200 retained image CCAT questions plus 800 retained
text questions, and the original 30 MTT questions. Each CCAT attempt selects 80
unique prompts across available categories, including diagrams. MTT selects ten
questions each worth 3, 4, and 5 points, then shuffles the 30 questions. Selection
and answer keys are frozen server-side per attempt so edits cannot change a live test.
The seed no longer overwrites existing bank content. No new demo questions were authored.

The restore script is dry-run by default: `npx tsx scripts/restore-assessment-banks.ts`.
Review its report before using `--apply`; it backs up replaced CCAT/MTT rows locally.
Never use a full database reset or full demo seed as a production migration.

Both Prisma schemas add nullable `AssessmentAttempt.questionSnapshot`. Local SQLite
development and QA databases have been updated. This does **not** migrate the remote
Supabase database or deploy the app. Before production rollout, back up the target,
review and apply the additive schema change, and review the bank import against the
actual production database. Keep snapshots/answer keys inaccessible to candidates;
only sanitized question data may be returned to the browser. Existing application
history and Storage assets must be preserved.
