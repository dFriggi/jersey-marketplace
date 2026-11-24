import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/core/errors";
import { UserModel } from "../../../src/modules/users/user.model";
import { UserRepository } from "../../../src/modules/users/user.repository";
import { useTestDatabase } from "../../helpers/database";

const repository = new UserRepository();

function aUser(overrides: Partial<{ name: string; email: string; passwordHash: string }> = {}) {
  return { name: "Ana", email: "ana@email.com", passwordHash: "hash-da-senha", ...overrides };
}

describe("UserRepository", () => {
  useTestDatabase();

  it("create devolve o usuário com id em texto, papel USER e sem o hash da senha", async () => {
    const user = await repository.create(aUser());

    expect(user).toEqual({
      id: expect.any(String),
      name: "Ana",
      email: "ana@email.com",
      roles: ["USER"],
      createdAt: expect.any(Date),
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("o hash fica gravado no banco, mesmo sem sair na entidade", async () => {
    const user = await repository.create(aUser());

    const stored = await UserModel.findById(user.id).lean();

    expect(stored?.passwordHash).toBe("hash-da-senha");
  });

  it("findById devolve o mesmo usuário, também sem o hash", async () => {
    const created = await repository.create(aUser());

    const found = await repository.findById(created.id);

    expect(found).toEqual(created);
    expect(found).not.toHaveProperty("passwordHash");
  });

  it("findByIdOrFail de um id inexistente lança not_found com code user_not_found", async () => {
    await expect(repository.findByIdOrFail("000000000000000000000000")).rejects.toMatchObject({
      kind: "not_found",
      code: "user_not_found",
    });
  });

  it.each(["ana@email.com", "ANA@Email.com"])(
    "e-mail repetido (%s) vira conflict com code duplicate_email",
    async (email) => {
      await repository.create(aUser());

      const error = await repository.create(aUser({ email })).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ kind: "conflict", code: "duplicate_email" });
    }
  );

  it("5 cadastros simultâneos com o mesmo e-mail: só 1 vence", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => repository.create(aUser({ name: `Ana ${i}` })))
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const result of rejected) expect(result.reason).toMatchObject({ code: "duplicate_email" });
    expect(await UserModel.countDocuments()).toBe(1);
  });

  describe("findCredentialsByEmail", () => {
    it("devolve só o id e o hash, para o login conferir a senha", async () => {
      const user = await repository.create(aUser());

      expect(await repository.findCredentialsByEmail("ana@email.com")).toEqual({
        id: user.id,
        passwordHash: "hash-da-senha",
      });
    });

    it("acha o usuário com o email em letras maiúsculas e com espaços nas pontas", async () => {
      const user = await repository.create(aUser());

      const credentials = await repository.findCredentialsByEmail("  ANA@Email.com ");

      expect(credentials?.id).toBe(user.id);
    });

    it("devolve null para um email inexistente", async () => {
      await repository.create(aUser());

      expect(await repository.findCredentialsByEmail("outra@email.com")).toBeNull();
    });
  });
});
