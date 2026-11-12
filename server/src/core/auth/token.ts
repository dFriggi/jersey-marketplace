import { jwtVerify, SignJWT } from "jose";
import { clock } from "../clock";
import { loadConfig } from "../config";
import { DomainError } from "../errors";

//login válido por 7 dias
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
  userId: string;
  roles: string[];
}

const secret = () => new TextEncoder().encode(loadConfig().JWT_SECRET);

const nowInSeconds = () => Math.floor(clock.now().getTime() / 1000);

export async function signToken({ userId, roles }: TokenPayload): Promise<string> {
  const now = nowInSeconds();

  return new SignJWT({ roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(secret());
}

//qualquer problema vira o mesmo erro
export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], currentDate: clock.now() });

    if (typeof payload.sub !== "string" || !Array.isArray(payload.roles)) {
      throw new Error("token sem userId ou roles");
    }

    return { userId: payload.sub, roles: payload.roles.map(String) };
  } catch {
    throw new DomainError("unauthorized", "invalid_token", "Sessão inválida ou expirada. Entre de novo.");
  }
}
