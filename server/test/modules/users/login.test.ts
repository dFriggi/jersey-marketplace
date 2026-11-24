import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app";
// a model precisa estar importada antes do syncIndexes, para o indice único de e-mail existir
import "../../../src/modules/users/user.model";
import { useTestDatabase } from "../../helpers/database";

const app = createApp();
const ana = { name: "Ana", email: "ana@email.com", password: "senha-forte-123" };

const registerUser = async (user = ana) => (await request(app).post("/auth/register").send(user)).body;

//agent guarda os cookies entre as requisições, como um navegador
const loggedInAgent = async (user = ana) => {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: user.email, password: user.password }).expect(200);
  return agent;
};

const setCookieOf = (response: request.Response): string =>
  ([] as string[]).concat(response.headers["set-cookie"] ?? []).join("; ");

describe("login, logout e /users/me", () => {
  useTestDatabase();

  describe("POST /auth/login", () => {
    it("login certo responde 200 com o usuário e grava o cookie do token", async () => {
      const registered = await registerUser();

      const response = await request(app).post("/auth/login").send({ email: ana.email, password: ana.password });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(registered);
      expect(response.body).not.toHaveProperty("passwordHash");

      const cookie = setCookieOf(response);
      expect(cookie).toMatch(/^token=[\w-]+\.[\w-]+\.[\w-]+;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=604800");
    });

    it("aceita o email com letras maiusculas", async () => {
      await registerUser();

      const response = await request(app).post("/auth/login").send({ email: "ANA@Email.com", password: ana.password });

      expect(response.status).toBe(200);
    });

    it("senha errada responde 401 invalid_credentials e não grava cookie", async () => {
      await registerUser();

      const response = await request(app).post("/auth/login").send({ email: ana.email, password: "senha-errada" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("invalid_credentials");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("email inexistente responde o mesmo que a senha errada", async () => {
      await registerUser();

      const wrongPassword = await request(app).post("/auth/login").send({ email: ana.email, password: "senha-errada" });
      const unknownEmail = await request(app)
        .post("/auth/login")
        .send({ email: "ninguem@email.com", password: ana.password });

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it.each([
      ["sem email", { password: ana.password }],
      ["email inválido", { email: "nao-e-email", password: ana.password }],
      ["senha vazia", { email: ana.email, password: "" }],
    ])("%s responde 400 invalid_input", async (_case, body) => {
      const response = await request(app).post("/auth/login").send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("invalid_input");
    });
  });

  describe("GET /users/me", () => {
    it("sem login responde 401 not_authenticated", async () => {
      const response = await request(app).get("/users/me");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("not_authenticated");
    });

    it("depois do login responde 200 com o próprio usuário", async () => {
      const registered = await registerUser();
      const agent = await loggedInAgent();

      const response = await agent.get("/users/me");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(registered);
    });

    it("cada um ve o próprio perfil", async () => {
      const bia = { name: "Bia", email: "bia@email.com", password: "outra-senha-456" };
      await registerUser();
      await registerUser(bia);

      const anaAgent = await loggedInAgent();
      const biaAgent = await loggedInAgent(bia);

      expect((await anaAgent.get("/users/me")).body.email).toBe("ana@email.com");
      expect((await biaAgent.get("/users/me")).body.email).toBe("bia@email.com");
    });

    it("com o cookie adulterado responde 401 invalid_token", async () => {
      const response = await request(app).get("/users/me").set("Cookie", "token=isso.nao.vale");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("invalid_token");
    });
  });

  describe("POST /auth/logout", () => {
    it("responde 204, apaga o cookie e o /users/me volta a responder 401", async () => {
      await registerUser();
      const agent = await loggedInAgent();
      expect((await agent.get("/users/me")).status).toBe(200);

      const response = await agent.post("/auth/logout");

      expect(response.status).toBe(204);
      // o navegador só apaga o cookie se o Path for o mesmo do login (Path=/)
      expect(setCookieOf(response)).toMatch(/^token=;/);
      expect(setCookieOf(response)).toMatch(/Path=\/(;|$)/);
      expect((await agent.get("/users/me")).status).toBe(401);
    });

    it("sem estar logado também responde 204", async () => {
      const response = await request(app).post("/auth/logout");

      expect(response.status).toBe(204);
    });
  });
});
