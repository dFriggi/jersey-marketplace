import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signToken } from "../auth/token";
import { AUTH_COOKIE, currentUser, requireAuth } from "./auth";
import { errorHandler } from "./error-handler";

const app = express();
app.use(cookieParser());
app.get("/protegida", requireAuth, (req, res) => {
  res.json(currentUser(req));
});
app.get("/sem-middleware", (req, res) => {
  res.json(currentUser(req));
});
app.use(errorHandler);

const ana = { userId: "6735a1b2c3d4e5f6a7b8c9d0", roles: ["USER"] };

describe("requireAuth", () => {
  it("com um token válido no cookie, a rota recebe o usuário", async () => {
    const token = await signToken(ana);

    const response = await request(app).get("/protegida").set("Cookie", `${AUTH_COOKIE}=${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: ana.userId, roles: ["USER"] });
  });

  it("sem cookie responde 401 not_authenticated", async () => {
    const response = await request(app).get("/protegida");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("not_authenticated");
  });

  it("com o cookie vazio responde 401 not_authenticated", async () => {
    const response = await request(app).get("/protegida").set("Cookie", `${AUTH_COOKIE}=`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("not_authenticated");
  });

  it("com um token inválido responde 401 invalid_token", async () => {
    const response = await request(app).get("/protegida").set("Cookie", `${AUTH_COOKIE}=token-falso`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_token");
  });

  it("só aceita o token pelo cookie, não pelo header Authorization", async () => {
    const token = await signToken(ana);

    const response = await request(app).get("/protegida").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("not_authenticated");
  });
});

describe("currentUser", () => {
  it("numa rota sem o requireAuth, responde 401 em vez de quebrar", async () => {
    const response = await request(app).get("/sem-middleware");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("not_authenticated");
  });
});
