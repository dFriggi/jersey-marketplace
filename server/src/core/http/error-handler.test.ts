import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainError, invalidTransition, type ErrorKind } from "../errors";
import { errorHandler } from "./error-handler";

function appThatThrows(error: unknown) {
  const app = express();
  app.use(express.json());
  app.post("/", async () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each<[ErrorKind, number]>([
    ["validation", 400],
    ["unauthorized", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["business_rule", 422],
  ])("DomainError %s vira status %i", async (kind, status) => {
    const response = await request(appThatThrows(new DomainError(kind, "some_code", "Mensagem", { campo: "x" }))).post(
      "/"
    );

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code: "some_code", message: "Mensagem", details: { campo: "x" } } });
  });

  it("sem details, a resposta não tem o campo details", async () => {
    const response = await request(appThatThrows(new DomainError("not_found", "shirt_not_found", "Não achei"))).post(
      "/"
    );

    expect(response.body).toEqual({ error: { code: "shirt_not_found", message: "Não achei" } });
  });

  it("invalidTransition vira 409 com a transição nos details", async () => {
    const response = await request(appThatThrows(invalidTransition("deal", "PAID", "CREATED"))).post("/");

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "invalid_transition",
      details: { entity: "deal", from: "PAID", to: "CREATED" },
    });
  });

  it("erro inesperado vira 500 sem mostrar a mensagem original", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(appThatThrows(new Error("senha do banco: segredo"))).post("/");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "internal_error", message: "Erro interno no servidor" } });
    expect(JSON.stringify(response.body)).not.toContain("segredo");
    expect(log).toHaveBeenCalledOnce();
  });

  it("algo que não é Error também vira 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(appThatThrows("só um texto")).post("/");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("internal_error");
  });

  it("JSON malformado no corpo vira 400 invalid_json", async () => {
    const response = await request(appThatThrows(new Error("não deveria chegar na rota")))
      .post("/")
      .set("Content-Type", "application/json")
      .send("{ isso não é json");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_json");
  });
});
