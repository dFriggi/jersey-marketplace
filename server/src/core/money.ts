import { DomainError } from "./errors";

// dinheiro sempre em centavos inteiros e funções puras.

export type Cents = number;

export function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function assertCents(value: number, field = "amountCents"): Cents {
  if (!isValidCents(value)) {
    throw new DomainError(
      "business_rule",
      "invalid_amount",
      `${field} precisa ser um inteiro não negativo em centavos`
    );
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

export function fromReais(reais: number): Cents {
  return Math.round(reais * 100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100);
}
