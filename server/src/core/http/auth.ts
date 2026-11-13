import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth/token";
import { DomainError } from "../errors";

// quem esta logado, como as rotas enxergam
export interface AuthUser {
  id: string;
  roles: string[];
}

// ensina o TS que o req pode ter o user que o requireAuth coloca
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export const AUTH_COOKIE = "token";

const notAuthenticated = () => new DomainError("unauthorized", "not_authenticated", "Faça login para continuar");

//sem cookie ou com token invalido, responde 401. com token valido, coloca o usuário em req.user
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[AUTH_COOKIE];

  if (typeof token !== "string" || token === "") throw notAuthenticated();

  const { userId, roles } = await verifyToken(token);
  req.user = { id: userId, roles };

  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw notAuthenticated();

  return req.user;
}
