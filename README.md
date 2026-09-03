# Recruitment Portal

Production-oriented recruitment workflow built with Next.js, Prisma and Supabase. Candidates apply through a public drive link and upload a CV; staff review screening results, assign independent funnel tracks, grade assessments and record final decisions.

## Roles and editable workflow

- **Admin:** creates recruiter/reviewer accounts, manages drives and candidates, university tiers, audit logs, leaderboards and encrypted AI provider/model settings.
- **Recruiter:** creates drives and funnels, configures phases/thresholds, assigns or moves candidates, issues online/onsite attempts and records decisions.
- **Reviewer:** sees only assigned submissions and performs manual review.
- **Candidate:** self-registers from a public drive link, uploads a CV and completes released assessments. Internal scores, rubrics and funnel references remain staff-only.

Question banks, scoring logic and UI can be changed in code. Normal recruitment configuration should be changed through the Admin/Recruiter portals so it remains audited.

## Local setup

1. Install Node.js 22 or later and run `npm ci`.
2. Copy `.env.example` to `.env` and supply local secrets. Never commit `.env`.
3. Use `npm run dev:web` for the Supabase-backed portal.
4. Run `npm run typecheck` and `npm test` before merging changes.
5. Use `npm run build:supabase` for Vercel/production builds.

The PostgreSQL schema is `prisma/schema.postgresql.prisma`. Database and security changes belong in reviewed migrations under `supabase/migrations`; do not use reset or demo-seed commands against production.

## Company handover checklist

Transfer access instead of sharing personal passwords:

1. Transfer both GitHub repositories to the company organization, or grant the company team maintain/admin access and choose one canonical remote.
2. Add at least two company owners to the Supabase organization/project, then remove personal access only after they verify Auth, Database, Storage, backups and billing.
3. Transfer/link the Vercel project to the company team and configure production/preview environment variables from `.env.example` in Vercel—not in Git.
4. Transfer Cloudflare Turnstile, email/SMTP or Resend, AI-provider and domain/DNS ownership.
5. Rotate Supabase database credentials, secret/service keys, AI keys, `CRON_SECRET`, `AI_SETTINGS_ENCRYPTION_KEY` and `CV_TOKEN_SECRET` after handover. Rotation must update Vercel before old values are revoked.
6. Create named Admin accounts for company owners. Do not keep shared production accounts or the test candidate after acceptance testing.
7. Verify a Vercel preview end to end: public signup, CV upload/storage, screening worker, recruiter assignment, candidate assessment, reviewer grading, notifications, password recovery and staff MFA.
8. Confirm backup/restore and rollback procedures before publishing the public application link.

Detailed launch and least-privilege status is recorded in [docs/public-launch-rollout.md](docs/public-launch-rollout.md) and [docs/runtime-role-rollout.md](docs/runtime-role-rollout.md).

## Current test identities

The connected Supabase project currently has linked test identities for `admin@portal.com`, `recruiter@portal.com`, `reviewer@portal.com` and `candidate1@portal.com`. Passwords are stored outside Git. Replace these with named company accounts before production use.

## Production gates

Run `node scripts/launch-preflight.mjs` with the trusted Supabase database CA. Do not launch publicly until it passes. At minimum production needs a valid `APP_URL`, Turnstile keys, a 32+ character `CRON_SECRET`, direct Auth signup disabled in favor of the protected portal signup, a dedicated least-privilege runtime database login, verified SMTP/recovery, staff MFA and a successful Vercel preview test.
