import { z } from "zod";
import { DomainError } from "../errors";

// mensagens de erro do zod em português
z.config(z.locales.ptBR());

/* confere a entrada contra o schema. se estiver certa, devolve os dados tipados e sem os campos que o schema não conhece.
se não, lança domain error validation com a lista dos problemas*/
export function validate<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));

  throw new DomainError("validation", "invalid_input", "Dados inválidos", { issues });
}
