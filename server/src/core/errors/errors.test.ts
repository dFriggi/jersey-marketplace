import { describe, expect, it } from "vitest";
import { DomainError, invalidTransition } from "./index";

describe("erros de domínio", () => {
  it("DomainError guarda o kind, o code e a message", () => {
    const error = new DomainError("not_found", "shirt_not_found", "Camisa não encontrada");

    expect(error).toMatchObject({ kind: "not_found", code: "shirt_not_found", message: "Camisa não encontrada" });
    expect(error.details).toBeUndefined();
  });

  it("é um Error de verdade (o Express e os logs o reconhecem assim)", () => {
    const error = new DomainError("conflict", "shirt_unavailable", "Alguém chegou antes");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DomainError");
  });

  it("invalidTransition monta um conflito com a mensagem e os detalhes da transição", () => {
    const error = invalidTransition("proposta", "REJECTED", "ACCEPTED");

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      kind: "conflict",
      code: "invalid_transition",
      message: "Não é possível mudar proposta de REJECTED para ACCEPTED",
      details: { entity: "proposta", from: "REJECTED", to: "ACCEPTED" },
    });
  });
});
