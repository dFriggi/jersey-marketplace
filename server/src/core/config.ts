import { z } from "zod";

// variaveis de ambiente validadas na inicialização. Traz uma mensagem com o erro correspondente

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  MONGO_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/jersey?replicaSet=rs0&directConnection=true"),
  JWT_SECRET: z.string().min(32, "precisa de pelo menos 32 caracteres"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
});

export type Config = z.infer<typeof EnvSchema>;

// recebe env como parametro, valida e devolve a config ou um erro específico
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${problems}`);
  }

  return result.data;
}
