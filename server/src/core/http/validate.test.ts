import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DomainError } from "../errors";
import { errorHandler } from "./error-handler";
import { validate } from "./validate";

const shirtSchema = z.object({
  team: z.string().min(1),
  priceCents: z.number().int().positive(),
  address: z.object({ zip: z.string().length(8) }).optional(),
  photos: z.array(z.string()).default([]),
});

function err(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("validate deveria ter lançado");
}

describe("validate", () => {
  it("entrada certa, devolve os dados com os valores padrão preenchidos", () => {
    expect(validate(shirtSchema, { team: "Flamengo", priceCents: 15000 })).toEqual({
      team: "Flamengo",
      priceCents: 15000,
      photos: [],
    });
  });

  it("remove campos que o schema não conhece", () => {
    const data = validate(shirtSchema, { team: "Flamengo", priceCents: 15000, ownerId: "outra-pessoa" });

    expect(data).not.toHaveProperty("ownerId");
  });

  it("entrada errada, lança DomainError validation com code invalid_input", () => {
    const error = err(() => validate(shirtSchema, { team: "", priceCents: 15000 }));

    expect(error.kind).toBe("validation");
    expect(error.code).toBe("invalid_input");
  });

  it("lista todos os problemas, com o caminho de cada campo", () => {
    const error = err(() => validate(shirtSchema, { priceCents: 10.5, address: { zip: "123" }, photos: ["ok", 7] }));

    const paths = (error.details as { issues: { path: string }[] }).issues.map((issue) => issue.path);
    expect(paths).toEqual(["team", "priceCents", "address.zip", "photos.1"]);
  });

  it("problema na entrada inteira fica com caminho vazio", () => {
    const error = err(() => validate(shirtSchema, "não é objeto"));

    expect(error.details).toEqual({ issues: [{ path: "", message: expect.any(String) }] });
  });

  it("as mensagens vem em português", () => {
    const error = err(() => validate(shirtSchema, { priceCents: 1 }));

    expect((error.details as { issues: { message: string }[] }).issues[0]!.message).toMatch(/esperava/);
  });

  describe("numa rota, junto com o errorHandler", () => {
    const app = express();
    app.use(express.json());
    app.post("/shirts", (req, res) => {
      const body = validate(shirtSchema, req.body);
      res.status(201).json(body);
    });
    app.get("/shirts", (req, res) => {
      const query = validate(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
      res.json(query);
    });
    app.use(errorHandler);

    it("corpo inválido vira 400 com os problemas nos details", async () => {
      const response = await request(app).post("/shirts").send({ team: "Flamengo" });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: "invalid_input",
        details: { issues: [{ path: "priceCents" }] },
      });
    });

    it("corpo válido chega na rota já tratado", async () => {
      const response = await request(app).post("/shirts").send({ team: "Flamengo", priceCents: 15000, extra: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ team: "Flamengo", priceCents: 15000, photos: [] });
    });

    it("query em texto é convertida pelo schema", async () => {
      expect((await request(app).get("/shirts?page=3")).body).toEqual({ page: 3 });
      expect((await request(app).get("/shirts")).body).toEqual({ page: 1 });
      expect((await request(app).get("/shirts?page=zero")).status).toBe(400);
    });
  });
});
