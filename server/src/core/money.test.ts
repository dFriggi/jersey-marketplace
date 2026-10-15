import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { assertCents, formatBRL, fromReais, isValidCents, sumCents } from "./money";

describe("money", () => {
  it.each([
    [0, true],
    [35000, true],
    [-1, false],
    [10.5, false],
    [Number.NaN, false],
    [Number.MAX_SAFE_INTEGER + 1, false],
  ])("isValidCents(%d) = %s", (value, expected) => {
    expect(isValidCents(value)).toBe(expected);
  });

  it("assertCents devolve o valor válido e lança erro de regra de negócio para inválido", () => {
    expect(assertCents(100)).toBe(100);
    expect(() => assertCents(-100)).toThrow(DomainError);
    expect(() => assertCents(-100)).toThrow(expect.objectContaining({ kind: "business_rule", code: "invalid_amount" }));
  });

  it.each([
    [0.1 + 0.2, 30],
    [1.15, 115],
    [0.29, 29],
    [350.5, 35050],
  ])("fromReais(%d) = %d centavos, arredondando o erro de float", (reais, cents) => {
    expect(fromReais(reais)).toBe(cents);
  });

  it("sumCents soma centavos e a lista vazia soma zero", () => {
    expect(sumCents([15000, 20000, 1])).toBe(35001);
    expect(sumCents([])).toBe(0);
  });

  it("formatBRL formata em reais", () => {
    expect(formatBRL(35050).replace(/\s/g, " ")).toBe("R$ 350,50");
  });
});
