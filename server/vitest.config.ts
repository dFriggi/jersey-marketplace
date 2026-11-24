import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    hookTimeout: 180_000,
    env: { JWT_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres" },
  },
});
