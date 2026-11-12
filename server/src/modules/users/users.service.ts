import bcrypt from "bcryptjs";
import { UserRepository } from "./user.repository";
import type { User } from "./user.types";

const users = new UserRepository();

\const BCRYPT_COST = 10;

//senha chega validada pela rota e aqui vira hash e nunca é gravada
export async function register(input: { name: string; email: string; password: string }): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  return users.create({ name: input.name, email: input.email, passwordHash });
}
