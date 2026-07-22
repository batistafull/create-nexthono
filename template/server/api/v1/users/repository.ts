import { mapDeleted, newBaseFields, touchBaseFields } from "../../database/base";
import { getDb } from "../../database/client";
import type { UserRow } from "./types";

/**
 * Data-access layer for users. The ONLY layer that talks to the database.
 * Soft deletes are respected everywhere (deleted = 0).
 *
 * D1 is asynchronous, so every method returns a Promise. Parameters are
 * positional (`?`) — D1 does not support named (`@name`) binds — and writes
 * use `RETURNING *` so we get the affected row without a second query.
 */

type CreateUserData = {
  name: string;
  email: string;
  passwordHash: string;
  role: string;
};

type UpdateUserData = Partial<{
  name: string;
  email: string;
  passwordHash: string;
  role: string;
}>;

/** A row as SQLite returns it: `deleted` is 0/1, not a boolean. */
type RawUserRow = Omit<UserRow, "deleted"> & { deleted: number };

function map(row: RawUserRow | null | undefined): UserRow | null {
  return row ? mapDeleted(row) : null;
}

export const userRepository = {
  async findAll(): Promise<UserRow[]> {
    const { results } = await getDb()
      .prepare("SELECT * FROM users WHERE deleted = 0 ORDER BY date_entered DESC")
      .all<RawUserRow>();
    return results.map((r) => mapDeleted(r));
  },

  async findById(id: string): Promise<UserRow | null> {
    const row = await getDb()
      .prepare("SELECT * FROM users WHERE id = ? AND deleted = 0")
      .bind(id)
      .first<RawUserRow>();
    return map(row);
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    const row = await getDb()
      .prepare("SELECT * FROM users WHERE email = ? AND deleted = 0")
      .bind(email)
      .first<RawUserRow>();
    return map(row);
  },

  async create(data: CreateUserData, actorId: string | null = null): Promise<UserRow> {
    const base = newBaseFields(actorId);
    const row = await getDb()
      .prepare(
        `INSERT INTO users
           (id, date_entered, date_modified, create_by, modified_by, deleted,
            name, email, password_hash, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .bind(
        base.id,
        base.date_entered,
        base.date_modified,
        base.create_by,
        base.modified_by,
        base.deleted,
        data.name,
        data.email,
        data.passwordHash,
        data.role,
      )
      .first<RawUserRow>();
    // INSERT ... RETURNING always yields the inserted row.
    return mapDeleted(row!);
  },

  async update(
    id: string,
    data: UpdateUserData,
    actorId: string | null = null,
  ): Promise<UserRow | null> {
    // Positional binds: the params array must follow the order of the `?` marks.
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      sets.push("name = ?");
      params.push(data.name);
    }
    if (data.email !== undefined) {
      sets.push("email = ?");
      params.push(data.email);
    }
    if (data.passwordHash !== undefined) {
      sets.push("password_hash = ?");
      params.push(data.passwordHash);
    }
    if (data.role !== undefined) {
      sets.push("role = ?");
      params.push(data.role);
    }

    const touch = touchBaseFields(actorId);
    sets.push("date_modified = ?", "modified_by = ?");
    params.push(touch.date_modified, touch.modified_by);

    // Trailing param for the WHERE clause.
    params.push(id);

    const row = await getDb()
      .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND deleted = 0 RETURNING *`)
      .bind(...params)
      .first<RawUserRow>();
    return map(row);
  },

  /** Soft delete. */
  async softDelete(id: string, actorId: string | null = null): Promise<boolean> {
    const touch = touchBaseFields(actorId);
    const result = await getDb()
      .prepare(
        `UPDATE users
           SET deleted = 1, date_modified = ?, modified_by = ?
         WHERE id = ? AND deleted = 0`,
      )
      .bind(touch.date_modified, touch.modified_by, id)
      .run();
    return result.meta.changes > 0;
  },
};
