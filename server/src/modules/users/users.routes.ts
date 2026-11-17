import { Router } from "express";
import { z } from "zod";
import { validate } from "../../core/http/validate";
import { register } from "./users.service";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  // bcrypt considera os primeiros 72 bytes da senha
  password: z.string().min(8).max(72),
});

export const usersRouter = Router();

usersRouter.post("/auth/register", async (req, res) => {
  const input = validate(RegisterSchema, req.body);
  const user = await register(input);

  res.status(201).json(user);
});
