-- Staged, inactive server-only group. No credentials, memberships or connection
-- changes. Requires existing RLS/browser isolation; never modifies those grants.
-- This replaces the earlier broad CRUD proposal, NOT an instruction to retry it.
-- Applied after exact owner approval; filename matches the live migration version.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_runtime') THEN
    RAISE EXCEPTION 'Role already exists: review its effective permissions instead of overwriting';
  END IF;
END $$;
CREATE ROLE portal_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO portal_runtime;
DO $$
DECLARE
  item RECORD;
  operation TEXT;
  target TEXT;
  policy_clause TEXT;
BEGIN
  IF has_schema_privilege('portal_runtime', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Unexpected inherited schema CREATE permission';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('Question', 'SELECT'),
    ('RatBatch', 'SELECT'),
    ('RatSubmission', 'SELECT'),
    ('AuditLog', 'SELECT,INSERT'),
    ('ThresholdChange', 'SELECT,INSERT'),
    ('AuthRateLimit', 'SELECT,INSERT,UPDATE,DELETE'),
    ('Session', 'SELECT,INSERT,UPDATE,DELETE'),
    ('User', 'SELECT,INSERT,UPDATE,DELETE'),
    ('UniversityTier', 'SELECT,INSERT,UPDATE'),
    ('Drive', 'SELECT,INSERT,UPDATE'),
    ('Funnel', 'SELECT,INSERT,UPDATE'),
    ('Application', 'SELECT,INSERT,UPDATE'),
    ('AssessmentResult', 'SELECT,INSERT,UPDATE'),
    ('AssessmentAttempt', 'SELECT,INSERT,UPDATE'),
    ('Notification', 'SELECT,INSERT,UPDATE'),
    ('OnsiteInvite', 'SELECT,INSERT,UPDATE'),
    ('CvJob', 'SELECT,INSERT,UPDATE'),
    ('AiSetting', 'SELECT,INSERT,UPDATE')
  ) AS matrix(table_name, operations) LOOP
    target := format('public.%I', item.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(target) AND relrowsecurity AND relkind = 'r') THEN
      RAISE EXCEPTION 'Required RLS-enabled table missing: %', target;
    END IF;
    IF has_table_privilege('anon', target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Existing browser isolation must be reviewed: %', target;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = item.table_name) THEN
      RAISE EXCEPTION 'Existing policies require separate review: %', target;
    END IF;
    FOREACH operation IN ARRAY string_to_array(item.operations, ',') LOOP
      EXECUTE format('GRANT %s ON TABLE %s TO portal_runtime', operation, target);
      policy_clause := CASE operation
        WHEN 'SELECT' THEN 'USING (true)'
        WHEN 'INSERT' THEN 'WITH CHECK (true)'
        WHEN 'UPDATE' THEN 'USING (true) WITH CHECK (true)'
        WHEN 'DELETE' THEN CASE item.table_name
          WHEN 'User' THEN 'USING ("authId" IS NULL AND "passwordHash" = ''supabase:pending'')'
          WHEN 'AuthRateLimit' THEN 'USING ("expiresAt" < CURRENT_TIMESTAMP)'
          ELSE 'USING (true)' END
      END;
      -- Trusted backend only. User/drive authorization remains mandatory in
      -- server routes. These are NOT per-candidate row-isolation policies.
      EXECUTE format('CREATE POLICY %I ON %s FOR %s TO portal_runtime %s',
        'portal_runtime_' || lower(operation), target, operation, policy_clause);
    END LOOP;
    -- Fail the entire transaction if PUBLIC/inherited grants broaden the matrix.
    FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('portal_runtime', target, operation)
         <> (operation = ANY(string_to_array(item.operations, ','))) THEN
        RAISE EXCEPTION 'Effective privilege mismatch: % %', target, operation;
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
