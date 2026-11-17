import type { ErrorRequestHandler } from "express";
import { DomainError, type ErrorKind } from "../errors";

export const HTTP_STATUS: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
};

function isInvalidJson(error: unknown): boolean {
  return error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed";
}

/*transforma qualquer erro na resposta { error: { code, message, details } }.
o express so reconhece a função com 4 parâmetros para tratamento de erro, por isso o _next fica sem uso */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DomainError) {
    res.status(HTTP_STATUS[error.kind]).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (isInvalidJson(error)) {
    res.status(400).json({ error: { code: "invalid_json", message: "O corpo da requisição não é um JSON válido" } });
    return;
  }

  console.error(error);
  res.status(500).json({ error: { code: "internal_error", message: "Erro interno no servidor" } });
};
