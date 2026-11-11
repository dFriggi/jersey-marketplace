import { describe, expect, it } from "vitest";
import { UserModel } from "../../../src/modules/users/user.model";
import { useTestDatabase } from "../../helpers/database";

function aUser(overrides: Record<string, unknown> = {}) {
  return { name: "Ana", email: "ana@email.com", passwordHash: "hash", ...overrides };
}

describe("model de users", () => {
  useTestDatabase();

  it("syncIndexes cria o índice único de email", async () => {
    const indexes = await UserModel.collection.indexes();
    const emailIndex = indexes.find((index) => index.name === "email_1");

    expect(emailIndex).toMatchObject({ unique: true });
  });

  it("um usuário novo tem o papel USER e as datas preenchidas", async () => {
    const user = await UserModel.create(aUser());

    expect(user.toObject()).toMatchObject({ roles: ["USER"] });
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("grava o email em letras minúsculas e sem espaços nas pontas", async () => {
    const user = await UserModel.create(aUser({ email: "  Ana@Email.COM " }));

    expect(user.email).toBe("ana@email.com");
  });

  it("recusa o mesmo email duas vezes, mesmo escrito com maiúsculas", async () => {
    await UserModel.create(aUser());

    await expect(UserModel.create(aUser({ email: "ANA@email.com" }))).rejects.toMatchObject({ code: 11000 });
  });

  it("aceita o papel MEDIATOR", async () => {
    const user = await UserModel.create(aUser({ roles: ["USER", "MEDIATOR"] }));

    expect(user.roles).toEqual(["USER", "MEDIATOR"]);
  });

  it.each([
    ["sem nome", { name: undefined }],
    ["nome só com espaços", { name: "   " }],
    ["sem email", { email: undefined }],
    ["sem passwordHash", { passwordHash: undefined }],
    ["papel fora da lista", { roles: ["ADMIN"] }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(UserModel.create(aUser(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
