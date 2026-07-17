import type { User } from "./user";

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

export type AuthResult = {
  token: string;
  user: User;
};
