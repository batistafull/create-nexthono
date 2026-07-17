-- 001_init: users table.
-- Base fields (id, date_entered, date_modified, create_by, modified_by, deleted)
-- come first; domain fields follow.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  date_entered  TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  create_by     TEXT,
  modified_by   TEXT,
  deleted       INTEGER NOT NULL DEFAULT 0,

  -- domain fields
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user'
);

-- A single active (non-deleted) account per email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
  ON users (email) WHERE deleted = 0;
