import { mapDeleted, newBaseFields, touchBaseFields } from "../../database/base";
import { db } from "../../database/client";
import type { UserRow } from "./types";

/**
 * Data-access layer for users. The ONLY layer that talks to the database.
 * Soft deletes are respected everywhere (deleted = 0).
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

function map(row: RawUserRow | undefined): UserRow | null {
  return row ? mapDeleted(row) : null;
}

export const userRepository = {
  findAll(): UserRow[] {
    const rows = db
      .prepare("SELECT * FROM users WHERE deleted = 0 ORDER BY date_entered DESC")
      .all() as RawUserRow[];
    return rows.map((r) => mapDeleted(r));
  },

  findById(id: string): UserRow | null {
    const row = db.prepare("SELECT * FROM users WHERE id = ? AND deleted = 0").get(id) as
      | RawUserRow
      | undefined;
    return map(row);
  },

  findByEmail(email: string): UserRow | null {
    const row = db.prepare("SELECT * FROM users WHERE email = ? AND deleted = 0").get(email) as
      | RawUserRow
      | undefined;
    return map(row);
  },

  create(data: CreateUserData, actorId: string | null = null): UserRow {
    const base = newBaseFields(actorId);
    db.prepare(
      `INSERT INTO users
         (id, date_entered, date_modified, create_by, modified_by, deleted,
          name, email, password_hash, role)
       VALUES
         (@id, @date_entered, @date_modified, @create_by, @modified_by, @deleted,
          @name, @email, @password_hash, @role)`,
    ).run({
      ...base,
      name: data.name,
      email: data.email,
      password_hash: data.passwordHash,
      role: data.role,
    });
    return this.findById(base.id)!;
  },

  update(id: string, data: UpdateUserData, actorId: string | null = null): UserRow | null {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.name !== undefined) {
      sets.push("name = @name");
      params.name = data.name;
    }
    if (data.email !== undefined) {
      sets.push("email = @email");
      params.email = data.email;
    }
    if (data.passwordHash !== undefined) {
      sets.push("password_hash = @password_hash");
      params.password_hash = data.passwordHash;
    }
    if (data.role !== undefined) {
      sets.push("role = @role");
      params.role = data.role;
    }

    const touch = touchBaseFields(actorId);
    sets.push("date_modified = @date_modified", "modified_by = @modified_by");
    params.date_modified = touch.date_modified;
    params.modified_by = touch.modified_by;

    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = @id AND deleted = 0`).run(params);

    return this.findById(id);
  },

  /** Soft delete. */
  softDelete(id: string, actorId: string | null = null): boolean {
    const touch = touchBaseFields(actorId);
    const result = db
      .prepare(
        `UPDATE users
           SET deleted = 1, date_modified = @date_modified, modified_by = @modified_by
         WHERE id = @id AND deleted = 0`,
      )
      .run({ id, ...touch });
    return result.changes > 0;
  },
};
