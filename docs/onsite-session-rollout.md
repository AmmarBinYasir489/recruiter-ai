# Onsite sessions and job-specific CV evidence

Bulk **Onsite: Full funnel** requires a published funnel from the candidate's drive.
The new track uses `ONSITE:<funnelId>` and preserves the original online application/results.
Candidates complete all enabled tests in order, including after a failed automatic test.
CV is reused, the invitation-only ONSITE stage is skipped, and FINAL remains held for staff.
Subjective results still require human review. Reviewing an earlier result must not rewind progress.
Per-candidate single-stage comparison retests remain available separately.

## Database rollout

Both Prisma schemas remove only `Application_candidateId_driveId_funnelId_key`.
The unique `(candidateId, driveId, trackKey)` constraint and existing access controls remain.
Review the Prisma schema diff against the target database before deploying. It should drop
only that superseded index; no application rows, question banks, or Storage files are removed.
Use the existing `db:push` / `db:push:supabase` deployment workflow after reviewing the diff.
Never run a database reset for this update. The PostgreSQL schema is prepared, but a local
SQLite verification does not imply the remote Supabase database has been migrated.

## CV scoring

New drives store recruiter-approved required/preferred skills in `rubricConfig.cvSkills`.
AI suggestions are optional drafts from the configured provider. Recruiters can edit both lists.
Legacy drives still use job-description requirement extraction.
Projects and experience must contain role/skill evidence: zero matches earn no credit,
one distinct match earns 50% evidence credit, two or more earn full credit. Related
certifications/coursework count; a profile URL alone does not earn points.
The staff CV details include the evidence and calculation. This is conservative text matching,
not proof that the candidate performed the work. Original extracted data is retained.
Existing stored scores are not automatically changed; use a deliberate CV reprocessing workflow.

Notification previews show three recent messages; history is paginated, never deleted.
Rapid identical notifications are suppressed for one minute (best-effort retry deduplication).
