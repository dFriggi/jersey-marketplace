import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app";
import { UserModel } from "../../../src/modules/users/user.model";
import { useTestDatabase } from "../../helpers/database";

const app = createApp();
const valid = { name: "Ana", email: "ana@email.com", password: "senha-forte-123" };

const postRegister = (body: unknown) =>
  request(app)
    .post("/auth/register")
    .send(body as object);

describe("POST /auth/register", () => {
  useTestDatabase();

  it("cadastro válido responde 201 com o usuário, sem senha e sem hash", async () => {
    const response = await postRegister(valid);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      name: "Ana",
      email: "ana@email.com",
      roles: ["USER"],
      createdAt: expect.any(String),
    });
  });

  it("guarda o hash da senha enviada", async () => {
    const { body } = await postRegister(valid);

    const stored = await UserModel.findById(body.id).lean();

    expect(await bcrypt.compare(valid.password, stored!.passwordHash)).toBe(true);
  });

  it("limpa os espaços do nome e grava o email em letras minúsculas", async () => {
    const { body } = await postRegister({ ...valid, name: "  Ana  ", email: "Ana@Email.COM" });

    expect(body).toMatchObject({ name: "Ana", email: "ana@email.com" });
  });

  it("ignora campos extras. Não é possível se cadastrar como mediador nem escolher o próprio hash", async () => {
    const { body } = await postRegister({ ...valid, roles: ["MEDIATOR"], passwordHash: "hash-escolhido" });

    const stored = await UserModel.findById(body.id).lean();

    expect(body.roles).toEqual(["USER"]);
    expect(stored?.passwordHash).not.toBe("hash-escolhido");
    expect(await bcrypt.compare(valid.password, stored!.passwordHash)).toBe(true);
  });

  it.each(["ana@email.com", "ANA@Email.com"])(
    "email já cadastrado (%s) responde 409 duplicate_email",
    async (email) => {
      await postRegister(valid);

      const response = await postRegister({ ...valid, name: "Outra Ana", email });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("duplicate_email");
    }
  );

  it.each([
    ["sem nome", { name: undefined }, "name"],
    ["nome com 1 letra", { name: "A" }, "name"],
    ["nome com 81 letras", { name: "A".repeat(81) }, "name"],
    ["email inválido", { email: "nao-e-email" }, "email"],
    ["senha com 7 caracteres", { password: "1234567" }, "password"],
    ["senha com 73 caracteres", { password: "a".repeat(73) }, "password"],
  ])("%s responde 400 invalid_input apontando o campo", async (_case, overrides, field) => {
    const response = await postRegister({ ...valid, ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_input");
    expect(response.body.error.details.issues).toEqual([{ path: field, message: expect.any(String) }]);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("corpo vazio aponta os três campos", async () => {
    const response = await postRegister({});

    const paths = response.body.error.details.issues.map((issue: { path: string }) => issue.path);
    expect(response.status).toBe(400);
    expect(paths).toEqual(["name", "email", "password"]);
  });

  it("JSON quebrado responde 400 invalid_json", async () => {
    const response = await request(app)
      .post("/auth/register")
      .set("Content-Type", "application/json")
      .send("{ quebrado");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_json");
  });

  it("5 cadastros simultâneos com o mesmo email: 1 responde 201 e 4 respondem 409", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) => postRegister({ ...valid, name: `Ana ${i}` }))
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(await UserModel.countDocuments()).toBe(1);
  });
});
