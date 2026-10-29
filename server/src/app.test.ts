import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("app", () => {
  it("GET /health responde que a API está no ar", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rota que não existe responde 404", async () => {
    const response = await request(createApp()).get("/rota-que-nao-existe");

    expect(response.status).toBe(404);
  });

  it("lê o corpo JSON da requisição", async () => {
    const app = createApp();
    app.post("/eco", (req, res) => {
      res.json(req.body);
    });

    const response = await request(app).post("/eco").send({ team: "Flamengo" });

    expect(response.body).toEqual({ team: "Flamengo" });
  });
});
