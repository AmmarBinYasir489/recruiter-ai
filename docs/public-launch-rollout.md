# Public application rollout

Status: code and local tests verified; **do not publish the application link until the live prerequisites below are complete**.

## Restricted runtime-role follow-up

The applied inactive role now uses an audited per-table matrix: question banks and
legacy RAT tables read-only, audit/threshold history append-only, no workflow-record
DELETE, and narrowly scoped account/rate/session cleanup. The group stays
NOLOGIN with no explicit membership or connection switch. Existing browser grants,
Auth and Storage are untouched. After the owner explicitly approved the exact
scope, migration `20260903101845_stage_least_privilege_runtime_role` succeeded.
Verified all 18 permission sets, 49 policies, no browser grants and unchanged
data counts. No application login was provisioned or switched. The connector's
creator membership cannot SET ROLE, so dedicated-login workflow tests remain
pending. See [exact scope and cutover gates](runtime-role-rollout.md).

Preflight now also checks effective table permissions against the runtime matrix,
including unwanted privileges inherited through PUBLIC or another role. Passing
this check alone does not verify RLS row behavior or end-to-end workflows.

## September 3 follow-up — connected project verified

- Owner-approved cleanup initially retained `admin@portal.com`,
  `recruiter@portal.com`, and `candidate1@portal.com`. It removed 3 obsolete portal
  accounts, their 2 applications and 2 exactly referenced CV objects, plus 14
  obsolete Supabase Auth identities and their provider sessions. Drives, question
  banks and question images were outside deletion scope. The retained candidate and
  recruiter identities are now linked by exact email to their portal records.
  Admin and reviewer provisioning was completed in the final verification noted below.
- Connector access to `lvmnqpsfussgfizxvhpf` (`neodym recruit`) now works.
- Applied live migration `public_auth_mapping_and_rate_limits`: `User.authId` and its unique index, `AuthRateLimit` and expiry index. Verified all 18 public portal tables have RLS and zero browser table grants. Before/after counts unchanged: 6 portal users, 4 applications, 265 questions, 23 attempts, 14 Auth users. These checks are not a full backup; backup/restore readiness remains unverified.
- Added `/forgot-password` with single-use emailed recovery codes, generic account-existence responses, shared rate/bot checks, password validation and global refresh-session sign-out after reset. Existing verified TOTP factors must also be verified before resetting a password. Recovery does not link accounts by email or remove MFA. Existing access JWTs can remain valid until expiry after global sign-out.
- Added `/security/mfa` with authenticator enrollment and verification. Production staff reads and writes require AAL2 centrally through `getCurrentUser`; only the dedicated setup page/actions use the AAL1 exception. `STAFF_MFA_REQUIRED=true` enables the same requirement locally. Production cannot disable it with this flag. Candidate signup is unchanged.
- Live disposable Auth-only test passed: recovery + OTP replay rejection, MFA enrollment, password recovery with MFA, password-only sign-in returning AAL1 while the factor remains enabled. Exact temporary identity was deleted. This does not verify SMTP delivery or deployed browser cookies.
- Full local suite: 185 tests across 25 files passed. Recovery page checked at 320/390/1280 pixels: no overflow or browser console/page errors. Unauthenticated MFA requests redirect to login. No real CVs were processed.
- PostgreSQL production build passed using the isolated `.next-build-check` output directory; local SQLite Prisma client restored afterward. This is compilation verification, not a Vercel deployment.
- The initial broad runtime-role proposal was denied. The narrower proposal was subsequently explicitly approved and applied as `supabase/migrations/20260903101845_stage_least_privilege_runtime_role.sql`; it creates only an inactive group. A dedicated login, trusted TLS and preview workflow verification remain required before switching the application connection.
- Final schema comparison found and fixed one more live blocker: nullable `AssessmentAttempt.questionSnapshot` was absent. Applied `assessment_question_snapshot` and verified the column is nullable text; existing attempt data was untouched. All Prisma model table/column names are now present (this check does not prove full index/constraint/type parity).
- Deployment preflight now exits nonzero for missing configuration and unsafe DB settings instead of printing a success-looking report. Current local blockers: Turnstile keys absent, public `APP_URL` absent/invalid, `CRON_SECRET` absent/too short, direct DB TLS `SELF_SIGNED_CERT_IN_CHAIN`.
- Live Auth still permits direct self-signup; email autoconfirm is enabled as requested. Security advisors: zero ERROR entries, one WARN for leaked-password protection disabled, and intentional deny-by-default RLS informational notices. No permissive browser policy was added to silence them.
- Two existing portal accounts have matching Supabase email identities but no verified `authId` linkage. They require verified reconciliation; no email-only linking was performed.
- Final portal counts remained 6 users / 4 applications / 265 questions / 23 attempts. Auth's total later read 16 (14 at the initial migration check); do not treat a changing live Auth count as permission to delete identities. The disposable security-test identity's deletion was confirmed separately.

### September 3 final identity verification

- Current retained portal identities are `admin@portal.com`, `recruiter@portal.com`,
  `reviewer@portal.com` and `candidate1@portal.com`.
- All four have exact Supabase Auth-to-portal `authId` mappings. Admin, recruiter and
  reviewer role metadata matches the server-side portal role.
- Real Chrome sign-in reached `/admin`, `/recruiter`, `/reviewer` and `/candidate`
  respectively with no browser-console errors. The retained candidate password was
  reset to the configured local test password and re-verified; no password is stored
  in this document or in Git.
- Current dashboard counts observed during verification were 4 users and 2
  applications. Earlier counts above describe historical migration checkpoints.

### Owner-controlled configuration still required

1. Provide the final public/Vercel URL (not credentials). Add real Turnstile keys and a 32+ character random `CRON_SECRET` in deployment settings. Keep secrets out of chat/Git.
2. Configure custom SMTP and paste `supabase/templates/recovery.html` into the Supabase **Reset Password** email template. It must include `{{ .Token }}`; test actual inbox delivery. Set the production Site URL. The recovery UI uses email-code entry, not token-bearing redirect URLs.
3. Disable direct Supabase self-signup only after verifying Admin-API portal registration in staging; enable leaked-password protection and provider-side abuse controls. These management settings were not changed by this task.
4. Inactive role approval/application is complete. Provision its separate login securely, verify trusted TLS and stage-test all workflows before updating the server connection. Current app connection has not been switched away from the owner.
5. Download the project's trusted database CA for local preflight, rotate previously exposed credentials, verify backups/restore and reconcile the two legacy identity conflicts.
6. Complete Vercel preview end-to-end signup/storage/MFA/recruiter-notification checks. Real CV processing/cron stays paused pending explicit approval to process resumes with the configured external AI provider. No deployment or public link publication was performed.

Local handoff: web portal restored at `http://localhost:3000` with Supabase Auth enabled. The real CV worker is stopped: safety approval rejected restarting unattended processing of real resumes. Obtain explicit approval before resuming external AI processing; new CV jobs will queue meanwhile. Disposable QA servers are stopped.

## Implemented flow

1. Share `/apply/<drive-id>` from the drive's publishing controls.
2. A visitor signs up using email/password only, with a bot challenge. The server fixes their role to `candidate`; no role/funnel supplied by the browser is accepted. Email confirmation is not required, per the chosen product policy. This means email ownership is not proven at signup.
3. Upload PDF/DOCX/TXT (10 MB maximum). In production, bytes go directly to private Supabase Storage using a signed URL. A short-lived signed ticket binds the upload to the candidate, drive and application. The server verifies file size/type before accepting it.
4. The application and CV job are committed together. OCR/extraction/scoring run in the worker. The candidate remains in the drive pool; a recruiter decides and assigns a funnel. AI never independently advances a candidate.
5. Existing applicants can continue after intake closes. New applications are rejected at the server, including a deadline crossed during upload. A drive is not automatically deleted.
6. Admins can create recruiter/reviewer accounts only. Supabase identity IDs map to database roles; email or user-editable JWT metadata never grants staff access.

## Before deploying

- Live auth migration is applied and verified; retain `prisma/migrations-manual/20260903-public-auth.sql` for reproducibility. It does not delete records or files. Verify the remaining schema matches `schema.postgresql.prisma` before deployment.
- Current configured project: `lvmnqpsfussgfizxvhpf`. Management connector access is restored. Direct database preflight still fails `SELF_SIGNED_CERT_IN_CHAIN`; provide the project's trusted CA via `SUPABASE_DB_CA_FILE`. **Never disable TLS validation.** [Supabase certificate instructions](https://supabase.com/docs/guides/platform/ssl-enforcement).
- Run `node scripts/launch-preflight.mjs`. Require the auth mapping/rate table, RLS on portal tables and no `anon`/`authenticated` portal-table grants. Check Supabase security advisors too. The migration deliberately does not change unrelated schemas or Storage policies.
- Use a dedicated least-privilege server database role before broad public rollout; the existing configured PostgreSQL owner connection is not a substitute for per-route authorization or least privilege. Provision its grants/RLS policies deliberately and verify all workflows; do not expose it to browsers.
- In Vercel set `SUPABASE_DATABASE_URL`, Supabase URL, public publishable/anon key, server secret key, private bucket names, `APP_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CRON_SECRET` (32+ characters), and `AI_SETTINGS_ENCRYPTION_KEY` (32+ characters). A dedicated `CV_TOKEN_SECRET` may also be used. Public origin must match the challenge hostname. Do not paste secrets into chat or commit `.env`.
- Rotate database credentials/server keys previously shared in chat. Update Vercel and local configuration after rotation.
- Keep email confirmation disabled as requested. Disable **direct Supabase self-signup** to prevent bypassing the portal's signup rate/bot controls; portal registration still works via the server Admin API. Existing sign-in is unaffected. Verify this in staging first. Configure provider-side login limits/CAPTCHA and your Vercel firewall too; application counters alone do not block direct Auth API traffic.
- Password recovery and enforced production staff MFA are now implemented; configure SMTP/email template and verify both on the deployed preview before broad public use. Legacy users are linked only after their existing password is verified. A conflicting existing Supabase identity is intentionally not auto-linked by email; it requires verified administrator reconciliation.

## Vercel

- `vercel.json` selects `npm run build:supabase`. This uses the PostgreSQL Prisma schema; ordinary `npm run build` is the local SQLite build.
- Keep the one two-minute CV worker cron. Use the Pro **team/project scope**, not a personal Hobby project. Current documented limit is 100 jobs/project; Hobby schedules run daily, Pro supports minute-level schedules. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- Cron requests require a timing-safe checked secret. Each invocation processes at most three jobs, with a five-minute function budget. Verify real OCR latency/queue throughput on preview; passing a build does not prove cron execution.
- Production ignores the local auth adapter and refuses local CV filesystem fallback. Missing Turnstile configuration fails closed.
- `.vercelignore` excludes environment files, databases, screenshots/reports, test sources, local uploads and old destructive migration scripts. Question banks/images remain included. Demo seeding refuses production; never run a reset/seed on live data.
- Removed the redundant, untracked `.env.backup-before-v2` after confirming it contained no unique configuration keys. Current `.env` and placeholder `.env.example` remain. The removed backup is not recoverable through Git; current configuration was preserved.

## Drive lifecycle

- OPEN: new applications accepted until deadline.
- CLOSED: intake blocked; existing assessments/reviews continue.
- COMPLETED: requires no pending applications, ready/active attempts, CV jobs needing attention or future invitations; assessment mutations blocked.
- ARCHIVED: hidden from normal drive lists, staff can still open records. Reversible. No automatic permanent deletion.

Do not add permanent deletion until the retention period, export and owner approval rules are agreed. Existing expired ACTIVE attempts or failed CV jobs must be resolved before completion; the application shows the blocking counts.

## Security boundaries and limitations

- Shared DB-backed fixed-window rate limits: signup 20/IP and 5/email per 15 minutes; sign-in 60/IP and 10/email; CV upload tickets 5/candidate. Vercel's trusted IP header is used; non-Vercel hosts share a conservative fallback bucket. Test the signup limit for large shared-office networks before rollout.
- Turnstile tokens are verified server-side for success, action and hostname; widgets reset after each submitted attempt. [Cloudflare validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- Supabase SSR uses HTTP-only cookies and refresh middleware; role lookup uses verified `authId`. Authenticated responses are not cacheable.
- AI documents/answers are untrusted data under provider system instructions. Explicit injection patterns force human review; fabricated project/skill evidence is filtered against source text and executable URLs are rejected. These are defense-in-depth measures, **not proof that prompt injection is impossible**. AI has no tools/record-mutation authority; staff decisions remain mandatory.
- CV format/size checks are not malware scanning. Add antivirus/document sanitization and stronger parser resource isolation for untrusted public documents; private orphan uploads also need an agreed cleanup policy.
- Word-search puzzles are mixed-direction, quadrant-spread and persisted per attempt. Server validates selected coordinate paths, ignores old client correctness flags and uses server elapsed time. This is not an anti-bot guarantee; visible puzzle solving cannot be prevented in a browser.

## Verification performed

- PostgreSQL production build: passed.
- TypeScript check: passed.
- Full regression/auth/bot suite: 171 tests passed across 24 files.
- Isolated browser flow: shared link → signup → CV-only application → queued CV → dashboard; closed intake blocks newcomers and retains existing access. Widths 320/390/768 checked for overflow. No runtime page errors detected.
- Live Supabase Auth API smoke: create test identity, sign-in, get-user, refresh, sign-out passed. The exact temporary identity was deleted. This is not a deployed end-to-end browser test.
- Supabase-backed browser test also passed using the isolated local application database: signup with real Supabase cookies, CV application, incorrect-password feedback, successful retry and closed-drive dashboard access. Test identities were deleted. Fixed a chained post-signup redirect/blank page and preserved inputs after validation errors. This still requires repetition on Vercel with PostgreSQL.
- Live private Storage smoke: signed raw upload, server download and anonymous download denial passed. The exact temporary probe was removed; existing CVs/images were untouched.
- npm production dependency audit: zero known vulnerabilities at check time.

Still required: owner-controlled configuration above; Turnstile with real keys; deployed Supabase-cookie login and Storage CORS; approved real CV OCR/scoring/cron; recruiter decision/notification on the deployed preview; SMTP delivery, staff MFA browser testing and least-privilege provisioning. No Vercel deployment was performed in this change.
