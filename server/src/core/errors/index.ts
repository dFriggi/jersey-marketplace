// Erro tem um code, usado pelo front e pelos testes, e uma message para o usuário, em português.

export type ErrorKind =
  | "validation" // 400
  | "unauthorized" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "conflict" // 409
  | "business_rule"; // 422

export class DomainError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function invalidTransition(entity: string, from: string, to: string): DomainError {
  return new DomainError("conflict", "invalid_transition", `Não é possível mudar ${entity} de ${from} para ${to}`, {
    entity,
    from,
    to,
  });
}
