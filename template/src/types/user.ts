/** A user as returned by the API (no password hash). */
export type User = {
  id: string;
  date_entered: string;
  date_modified: string;
  create_by: string | null;
  modified_by: string | null;
  deleted: boolean;
  name: string;
  email: string;
  role: string;
};
