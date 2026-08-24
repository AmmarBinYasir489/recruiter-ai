# Supabase production setup

The portal uses Supabase Postgres and private Supabase Storage from server-side code. It keeps the portal's existing cookie/session authentication; Supabase Auth is not required.

## Required environment variables

Copy the values into local `.env` and the production host. Never expose either database password or the Supabase secret key with a `NEXT_PUBLIC_` prefix.

- `SUPABASE_DATABASE_URL`: transaction-pooler connection string on port 6543. Add `pgbouncer=true&connection_limit=5`.
- `SUPABASE_DIRECT_URL`: direct database connection on port 5432, used only for schema deployment.
- `NEXT_PUBLIC_SUPABASE_URL`: URL for the same Supabase project. `SUPABASE_URL` is accepted as a server-only fallback.
- `SUPABASE_SECRET_KEY`: the project's server secret/service-role key.
- `SUPABASE_CV_BUCKET`: private CV bucket name. `SUPABASE_STORAGE_BUCKET` is accepted as a backward-compatible alias.
- `CRON_SECRET`: a strong random value used to authenticate the CV worker endpoint.
- `AI_SETTINGS_ENCRYPTION_KEY`: a separate random value of at least 32 bytes. Do not reuse the Supabase key.
- One AI provider key: `GEMINI_API_KEY` or `GROQ_API_KEY`.

All Supabase URL, key, and database values must belong to the same project reference. A mismatch makes `/api/health` return HTTP 503.

## One-time deployment

1. Run `npm run db:push:supabase` from a trusted machine with both database URLs configured.
2. Run `supabase/hardening.sql` in the Supabase SQL editor. It blocks browser roles from Prisma-managed tables and creates private CV/audio buckets.
3. Run `npm run db:seed:supabase` only for a fresh non-production environment. Production users should be provisioned separately with strong passwords.
4. Set the production build command to `npm run build:supabase`.
5. Deploy `vercel.json`. The cron invokes `/api/internal/cv-worker` every two minutes; Vercel sends `CRON_SECRET` as the bearer token.
6. Open `/api/health`. It must report `ok: true`, `database: true`, and `supabase.connected: true`.

## Operational checks

- Keep both storage buckets private. CV and recording downloads are authorized by portal API routes.
- Rotate the Supabase secret, database password, worker secret, and AI encryption key if they have appeared in logs or source control.
- Do not run `prisma db push --force-reset` against production.
- Back up Postgres before destructive schema work and enable Supabase point-in-time recovery where available.
- Review failed `CvJob` rows and audit logs. The worker retries failed jobs up to its configured limit.
