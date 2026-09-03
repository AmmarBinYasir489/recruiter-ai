// Runtime operations only: seed/import/reset tools require a separate owner connection.
export const runtimePrivileges = {
  Question: ['SELECT'], RatBatch: ['SELECT'], RatSubmission: ['SELECT'],
  AuditLog: ['SELECT', 'INSERT'], ThresholdChange: ['SELECT', 'INSERT'],
  AuthRateLimit: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  Session: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  User: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  ...Object.fromEntries(['UniversityTier', 'Drive', 'Funnel', 'Application',
    'AssessmentResult', 'AssessmentAttempt', 'Notification', 'OnsiteInvite',
    'CvJob', 'AiSetting'].map(name => [name, ['SELECT', 'INSERT', 'UPDATE']])),
};

export const runtimePrivilegeQuery = `
  select c.relname as table_name, c.relrowsecurity as rls,
    array(select permission from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permission
      where has_table_privilege(current_user, c.oid, permission)) as privileges
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')`;

export function runtimePrivilegeErrors(rows) {
  const errors = [];
  for (const [table, expected] of Object.entries(runtimePrivileges)) {
    const row = rows.find(r => r.table_name === table);
    if (!row) { errors.push(`${table}: missing`); continue; }
    if (!row.rls) errors.push(`${table}: RLS disabled`);
    for (const operation of expected) if (!row.privileges.includes(operation)) errors.push(`${table}: missing ${operation}`);
    for (const operation of row.privileges) if (!expected.includes(operation)) errors.push(`${table}: unexpected ${operation}`);
  }
  for (const row of rows) if (!Object.hasOwn(runtimePrivileges, row.table_name) && row.privileges.length) {
    errors.push(`${row.table_name}: unrelated table access`);
  }
  return errors;
}
