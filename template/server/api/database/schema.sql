-- Single source of truth for the database structure.
-- Every table starts with the mandatory base fields (rules/STRUCTURE_DB.md):
--   id, date_entered, date_modified, create_by, modified_by, deleted

-- Applied migrations tracker (managed by migrations.ts).
CREATE TABLE IF NOT EXISTS _migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
