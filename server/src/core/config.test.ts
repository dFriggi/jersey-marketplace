import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const SECRET = "um-segredo-de-teste-com-mais-de-32-caracteres";

describe("loadConfig", () => {
  it("aplica os valores padrão quando só o JWT_SECRET é informado", () => {
    expect(loadConfig({ JWT_SECRET: SECRET })).toEqual({
      NODE_ENV: "development",
      PORT: 3333,
      MONGO_URI: "mongodb://127.0.0.1:27017/jersey?replicaSet=rs0&directConnection=true",
      JWT_SECRET: SECRET,
      CLIENT_ORIGIN: "http://localhost:5173",
    });
  });

  it("converte PORT de texto para número", () => {
    expect(loadConfig({ JWT_SECRET: SECRET, PORT: "4000" }).PORT).toBe(4000);
  });

  it("falha sem JWT_SECRET, citando a variável", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
  });

  it("falha com JWT_SECRET curto", () => {
    expect(() => loadConfig({ JWT_SECRET: "curto" })).toThrow(/32 caracteres/);
  });

  it("falha com NODE_ENV fora da lista", () => {
    expect(() => loadConfig({ JWT_SECRET: SECRET, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("lista todos os problemas de uma vez, não só o primeiro", () => {
    expect(() => loadConfig({ NODE_ENV: "staging", PORT: "abc" })).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*JWT_SECRET/);
  });
});
