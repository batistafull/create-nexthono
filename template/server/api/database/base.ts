import { randomUUID } from "node:crypto";

/**
 * Mandatory base fields present on EVERY table (see rules/STRUCTURE_DB.md):
 *  - id           string | uuid
 *  - date_entered datetime (ISO string)
 *  - date_modified datetime (ISO string)
 *  - create_by    string | uuid
 *  - modified_by  string | uuid
 *  - deleted      boolean (stored as 0/1 in SQLite)
 */
export type BaseFields = {
  id: string;
  date_entered: string;
  date_modified: string;
  create_by: string | null;
  modified_by: string | null;
  deleted: boolean;
};

/** SQL fragment with the base columns. Prepend to every CREATE TABLE. */
export const BASE_COLUMNS_SQL = `
  id            TEXT PRIMARY KEY,
  date_entered  TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  create_by     TEXT,
  modified_by   TEXT,
  deleted       INTEGER NOT NULL DEFAULT 0
`;

/** Values for the base fields when inserting a brand new row. */
export function newBaseFields(actorId: string | null = null) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    date_entered: now,
    date_modified: now,
    create_by: actorId,
    modified_by: actorId,
    deleted: 0 as const,
  };
}

/** Values for the base fields to patch when updating a row. */
export function touchBaseFields(actorId: string | null = null) {
  return {
    date_modified: new Date().toISOString(),
    modified_by: actorId,
  };
}

/** Convert SQLite's 0/1 `deleted` into a real boolean on read. */
export function mapDeleted<T extends { deleted: number }>(
  row: T,
): Omit<T, "deleted"> & { deleted: boolean } {
  return { ...row, deleted: Boolean(row.deleted) };
}
