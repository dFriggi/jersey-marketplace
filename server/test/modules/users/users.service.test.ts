import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { UserModel } from "../../../src/modules/users/user.model";
import { register } from "../../../src/modules/users/users.service";
import { useTestDatabase } from "../../helpers/database";

const input = { name: "Ana", email: "ana@email.com", password: "senha-forte-123" };

describe("users.service: register", () => {
  useTestDatabase();

  it("cria o usuário e devolve sem senha e sem hash", async () => {
    const user = await register(input);

    expect(user).toMatchObject({ name: "Ana", email: "ana@email.com", roles: ["USER"] });
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("grava o hash da senha, nunca a senha", async () => {
    const user = await register(input);

    const stored = await UserModel.findById(user.id).lean();

    expect(stored?.passwordHash).not.toBe(input.password);
    expect(stored?.passwordHash).toMatch(/^\$2[ab]\$10\$/);
    expect(await bcrypt.compare(input.password, stored!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("outra-senha", stored!.passwordHash)).toBe(false);
  });

  it("a mesma senha gera hashes diferentes", async () => {
    const ana = await register(input);
    const bia = await register({ ...input, name: "Bia", email: "bia@email.com" });

    const [storedAna, storedBia] = await Promise.all([
      UserModel.findById(ana.id).lean(),
      UserModel.findById(bia.id).lean(),
    ]);

    expect(storedAna?.passwordHash).not.toBe(storedBia?.passwordHash);
  });

  it("email repetido sobe o erro duplicate_email do repository", async () => {
    await register(input);

    await expect(register({ ...input, email: "ANA@email.com" })).rejects.toMatchObject({
      kind: "conflict",
      code: "duplicate_email",
    });
  });
});
