import { Router } from "express";
import { z } from "zod";
import { validate } from "../../core/http/validate";
import { listShowcase } from "./catalog.service";

// filtro vazio (?team= ou só espaços) conta como "sem filtro"
function optionalText(max: number) {
  const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

const ShowcaseQuerySchema = z.object({
  team: optionalText(60),
  size: optionalText(10),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const catalogRouter = Router();

// vitrine pública: não precisa de login
catalogRouter.get("/listings", async (req, res) => {
  const query = validate(ShowcaseQuerySchema, req.query);

  res.json(await listShowcase(query));
});
