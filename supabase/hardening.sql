-- Run once in the Supabase SQL editor after `npm run db:push:supabase`.
-- The portal accesses these application tables only through Prisma on the server.
-- Supabase Storage remains available to the server through its secret key.

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', table_record.schemaname, table_record.tablename);
    execute format('revoke all privileges on table %I.%I from anon, authenticated', table_record.schemaname, table_record.tablename);
  end loop;
end $$;

-- Storage buckets are created and updated through the Supabase Storage API.
-- Supabase documents the managed `storage` schema as read-only application state.
