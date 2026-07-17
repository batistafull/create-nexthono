import type { User } from "../users/types";

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type AuthResult = {
  token: string;
  user: User;
};
