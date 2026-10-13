import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/**", "**/.data/**", "**/coverage/**"] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: { globals: globals.node },
    rules: {
      // parametros e variáveis que iniciam com _ podem ficar sem uso
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  prettier
);
