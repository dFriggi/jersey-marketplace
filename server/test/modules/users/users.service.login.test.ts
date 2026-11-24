import { describe, expect, it } from "vitest";
import { verifyToken } from "../../../src/core/auth/token";
import { DomainError } from "../../../src/core/errors";
import { UserModel } from "../../../src/modules/users/user.model";
import { getProfile, login, register } from "../../../src/modules/users/users.service";
import { useTestDatabase } from "../../helpers/database";

const ana = { name: "Ana", email: "ana@email.com", password: "senha-forte-123" };

const failureOf = (promise: Promise<unknown>) => promise.then(() => null).catch((error: unknown) => error);

describe("users.service, login e getProfile", () => {
  useTestDatabase();

  describe("login", () => {
    it("com email e senha corretos, devolve o usuário e um token dele", async () => {
      const registered = await register(ana);

      const { token, user } = await login({ email: ana.email, password: ana.password });

      expect(user).toEqual(registered);
      expect(user).not.toHaveProperty("passwordHash");
      expect(await verifyToken(token)).toEqual({ userId: registered.id, roles: ["USER"] });
    });

    it("aceita o email com letras maiúsculas", async () => {
      const registered = await register(ana);

      const { user } = await login({ email: "ANA@Email.com", password: ana.password });

      expect(user.id).toBe(registered.id);
    });

    it("senha errada lança unauthorized com code invalid_credentials", async () => {
      await register(ana);

      const error = await failureOf(login({ email: ana.email, password: "senha-errada" }));

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ kind: "unauthorized", code: "invalid_credentials" });
    });

    it("email inexistente da exatamente o mesmo erro da senha errada", async () => {
      await register(ana);

      const wrongPassword = await failureOf(login({ email: ana.email, password: "senha-errada" }));
      const unknownEmail = await failureOf(login({ email: "ninguem@email.com", password: ana.password }));

      expect(unknownEmail).toBeInstanceOf(DomainError);
      expect(unknownEmail).toMatchObject({
        kind: (wrongPassword as DomainError).kind,
        code: (wrongPassword as DomainError).code,
        message: (wrongPassword as DomainError).message,
      });
    });

    it("o papel MEDIATOR vai para o token", async () => {
      const registered = await register(ana);
      await UserModel.updateOne({ _id: registered.id }, { roles: ["USER", "MEDIATOR"] });

      const { token } = await login({ email: ana.email, password: ana.password });

      expect((await verifyToken(token)).roles).toEqual(["USER", "MEDIATOR"]);
    });
  });

  describe("getProfile", () => {
    it("devolve o próprio usuário, sem hash", async () => {
      const registered = await register(ana);

      expect(await getProfile(registered.id)).toEqual(registered);
    });

    it("id inexistente lança not_found com code user_not_found", async () => {
      await expect(getProfile("000000000000000000000000")).rejects.toMatchObject({
        kind: "not_found",
        code: "user_not_found",
      });
    });
  });
});
