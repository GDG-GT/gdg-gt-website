// Source-reconstruction repairs ONLY. These never modify historical SQL on disk
// and must never be deployed as target grants, policies, functions, or seed data.
export function repairedOrder(migrations) {
  const files = migrations.map(({ file }) => file);
  const moveBefore = (name, before) => {
    const file = files.find((item) => item.endsWith('/' + name));
    const anchor = files.find((item) => item.endsWith('/' + before));
    files.splice(files.indexOf(file), 1);
    files.splice(files.indexOf(anchor), 0, file);
  };
  const moveAfter = (name, after) => {
    const file = files.find((item) => item.endsWith('/' + name));
    const anchor = files.find((item) => item.endsWith('/' + after));
    files.splice(files.indexOf(file), 1);
    files.splice(files.indexOf(anchor) + 1, 0, file);
  };
  moveBefore('013_create_blog_system.sql', '008_add_blog_approval_columns.sql');
  moveBefore('20241227_create_public_blog_bucket.sql', '016_add_blog_submission_comments.sql');
  moveBefore('20241226_blog_improvements.sql', '20241225000001_fix_security_issues.sql');
  moveAfter('20250224_add_announcement_scheduling.sql', '20250224_team_features_expansion.sql');
  moveAfter('20250224_additional_features.sql', '20250224_add_announcement_scheduling.sql');
  return files;
}

export function repairSourceSql(file, input) {
  let source = input;
  const repairs = [];
  if (/CREATE POLICY IF NOT EXISTS/i.test(source)) {
    source = source.replace(/CREATE POLICY IF NOT EXISTS/gi, 'CREATE POLICY');
    repairs.push('Remove PostgreSQL-unsupported policy IF NOT EXISTS syntax; this replay starts empty.');
  }
  if (/GRANT USAGE ON SEQUENCE \w+_id_seq/gi.test(source)) {
    source = source.replace(/^GRANT USAGE ON SEQUENCE \w+_id_seq TO authenticated;[^\S\n]*$/gmi, '');
    repairs.push('Remove grants to nonexistent sequences for UUID primary keys.');
  }
  if (file.endsWith('/20250127_create_projects_table.sql')) {
    source = `ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS short_description varchar(500),
      ADD COLUMN IF NOT EXISTS category varchar(100) DEFAULT 'web',
      ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS difficulty_level varchar(50) DEFAULT 'intermediate',
      ADD COLUMN IF NOT EXISTS team_size integer DEFAULT 1,
      ADD COLUMN IF NOT EXISTS start_date date,
      ADD COLUMN IF NOT EXISTS end_date date,
      ADD COLUMN IF NOT EXISTS is_open_source boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS created_by uuid;\n` + source;
    repairs.push('Merge columns from later CREATE TABLE IF NOT EXISTS into the pre-existing baseline projects table.');
  }
  if (file.endsWith('/20250127_fix_admin_project_permissions.sql')) {
    source = 'DROP POLICY IF EXISTS "Public can view projects" ON projects;\n' + source;
    repairs.push('Remove the duplicate named project read policy before historical recreation.');
  }
  if (file.endsWith('/20250129_move_meeting_to_contact.sql')) {
    source = source.replace(/'"Thursdays at 7:00 PM"'::jsonb/g, `'"Thursdays at 7:00 PM"'::text`)
      .replace(/'"Thomas Building 100"'::jsonb/g, `'"Thomas Building 100"'::text`);
    repairs.push('Correct text/jsonb COALESCE type mismatch in historical content transform (not copied to GT).');
  }
  return { source, repairs };
}
