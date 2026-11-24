import { Router, type CookieOptions } from "express";
import { z } from "zod";
import { TOKEN_TTL_SECONDS } from "../../core/auth/token";
import { loadConfig } from "../../core/config";
import { AUTH_COOKIE, currentUser, requireAuth } from "../../core/http/auth";
import { validate } from "../../core/http/validate";
import { getProfile, login, register } from "./users.service";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  // bcrypt considera os primeiros 72 bytes da senha
  password: z.string().min(8).max(72),
});

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const authCookie = (): CookieOptions => ({
  httpOnly: true, // JS do navegador não consegue ler o cookie
  sameSite: "lax", // o cookie não vai junto em formulários enviados a outros sites
  secure: loadConfig().NODE_ENV === "production", // em produção, só por HTTPS
  path: "/",
});

export const usersRouter = Router();

usersRouter.post("/auth/register", async (req, res) => {
  const input = validate(RegisterSchema, req.body);
  const user = await register(input);

  res.status(201).json(user);
});

usersRouter.post("/auth/login", async (req, res) => {
  const input = validate(LoginSchema, req.body);
  const { token, user } = await login(input);

  res.cookie(AUTH_COOKIE, token, { ...authCookie(), maxAge: TOKEN_TTL_SECONDS * 1000 });
  res.json(user);
});

// o token não fica guardado no servidor
usersRouter.post("/auth/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, authCookie());
  res.status(204).end();
});

usersRouter.get("/users/me", requireAuth, async (req, res) => {
  const user = await getProfile(currentUser(req).id);

  res.json(user);
});
