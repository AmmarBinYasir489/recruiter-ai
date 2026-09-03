# Restricted backend role rollout

Status: **inactive role applied live after exact owner approval** on September 3.
Migration: `20260903101845_stage_least_privilege_runtime_role` in project
`lvmnqpsfussgfizxvhpf`. Earlier attempts were denied; the owner then explicitly
approved the documented scope. No alternate execution path was used.
Application connection and credentials remain unchanged. Provisioning/cutover
and end-to-end PostgreSQL workflow tests are still pending.

## Exact permission scope

Project: `lvmnqpsfussgfizxvhpf` (`neodym recruit`). New group: `portal_runtime`.

| Tables | Runtime permissions |
| --- | --- |
| Question, RatBatch, RatSubmission | SELECT only |
| AuditLog, ThresholdChange | SELECT, INSERT only |
| AuthRateLimit | SELECT, INSERT, UPDATE; DELETE only expired rows |
| Session | SELECT, INSERT, UPDATE, DELETE (logout/cleanup) |
| User | SELECT, INSERT, UPDATE; DELETE only unlinked `supabase:pending` provisioning rows |
| UniversityTier, Drive, Funnel, Application, AssessmentResult, AssessmentAttempt, Notification, OnsiteInvite, CvJob, AiSetting | SELECT, INSERT, UPDATE; no DELETE |

The group has NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION,
NOBYPASSRLS and schema USAGE only. No login/password, explicit membership grant,
connection change, Auth-user change, Storage change or data deletion is included.
Creating the role grants future capability, not an instruction to delete records.

Policies grant backend access to all rows for allowed operations (except the
limited DELETE predicates). Candidate/recruiter/reviewer access checks remain in
server routes. This is **not per-user database isolation**. A compromised backend
can still read sensitive data and change mutable fields; User UPDATE access means
the pending-account DELETE predicate is not a complete malicious-backend defense.

Question-bank imports, demo seeds, retention/purge tasks and schema migrations must
use a separately controlled maintenance connection, never the runtime login.
RAT legacy tables are read-only because no runtime writes currently use them.

## Non-disruptive sequence

1. Owner approved this exact matrix; the inactive group is now applied. Confirm
   recoverable backups before connection cutover. The migration did not
   revoke/replace working privileges or existing policies.
2. Test the migration against an isolated PostgreSQL copy, including new-account
   failure cleanup, session cleanup, shared rate counters and all role workflows.
   The local Docker daemon is unavailable; SQLite tests do not prove PG RLS behavior.
3. Completed: migration transaction checked all effective table privileges.
   PostgreSQL automatically granted creator `postgres` ADMIN OPTION, but both
   INHERIT and SET are false. No application login is a member; no login switched.
4. Provision a dedicated login through an owner-controlled secret channel. Grant
   only this group; do not grant it to anon, authenticated or authenticator. Never
   send the password via chat or commit it. Keep the schema/migration URL separate.
5. Supply the project's trusted CA and verify TLS. Do not disable certificate
   validation. The current direct connection fails SELF_SIGNED_CERT_IN_CHAIN.
6. Set the runtime URL in a preview deployment only. Verify signup, sign-in/MFA,
   application creation, isolated CV queue writes, candidate attempt submission,
   staff grading/decisions, funnel movement, thresholds and notifications.
   Use synthetic data; real external AI processing remains separately gated.
7. Run `node scripts/launch-preflight.mjs`. It now rejects missing/excessive runtime
   table grants, unrelated public-table access and absent RLS in addition to the
   existing owner-role/configuration checks. This is not a substitute for RLS
   execution tests, function privilege audit, schema checks or browser workflow QA.
8. Only after all checks pass, switch production during a controlled window.
   Preserve the previous working server configuration in the secret manager for
   emergency rollback. Roll back the deployment/configuration on regression;
   do not drop roles or data while sessions may still be using them.

## Verification in this change

- Before application: role absent, no public policies, browser grants zero.
- Existing schema public ACL grants no PUBLIC CREATE capability.
- Before proposed change: 6 portal users, 4 applications, 265 questions, 23 attempts.
- Source-level tests compare all 18 schema models with the SQL permission matrix,
  audit explicit Prisma calls, and reject excessive/missing permissions.
- Full isolated suite: 192 tests passed across 27 files; TypeScript check passed.
- After successful migration: all 18 effective privilege sets match the matrix;
  49 command-specific policies target only `portal_runtime`, all tables retain RLS,
  browser grants remain zero, and schema CREATE is denied. Three DELETE policies
  match the specified User/AuthRateLimit/Session predicates.
- Data counts remain 6 users / 4 applications / 265 questions / 23 attempts.
- The connector cannot SET ROLE because its creator membership has SET false.
  A read-only role-execution probe was denied before accessing records. No extra
  membership was granted to work around this. Dedicated-login RLS execution and
  workflow tests remain required; catalog checks are not end-to-end verification.
- Security advisors: zero ERROR, one pre-existing WARN for
  [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
  59 INFO notices. No Auth settings were changed.

References: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
