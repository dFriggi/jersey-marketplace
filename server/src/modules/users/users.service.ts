import bcrypt from "bcryptjs";
import { signToken } from "../../core/auth/token";
import { DomainError } from "../../core/errors";
import { UserRepository } from "./user.repository";
import type { User } from "./user.types";

const users = new UserRepository();

const BCRYPT_COST = 10;

//senha chega validada pela rota e aqui vira hash e nunca é gravada
export async function register(input: { name: string; email: string; password: string }): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  return users.create({ name: input.name, email: input.email, passwordHash });
}

// email que não existe e senha errada dão o mesmo erro
export async function login(input: { email: string; password: string }): Promise<{ token: string; user: User }> {
  const credentials = await users.findCredentialsByEmail(input.email);
  const passwordMatches = credentials ? await bcrypt.compare(input.password, credentials.passwordHash) : false;

  if (!credentials || !passwordMatches) {
    throw new DomainError("unauthorized", "invalid_credentials", "E-mail ou senha incorretos");
  }

  const user = await users.findByIdOrFail(credentials.id);
  const token = await signToken({ userId: user.id, roles: user.roles });

  return { token, user };
}

export function getProfile(userId: string): Promise<User> {
  return users.findByIdOrFail(userId);
}
