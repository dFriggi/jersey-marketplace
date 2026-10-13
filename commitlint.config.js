const TYPES = ["feat", "fix", "hotfix", "docs", "lint", "refactor", "perf", "test", "build", "ci", "chore", "revert"];

const SCOPES = [
  "core",
  "users",
  "catalog",
  "wallet",
  "trading",
  "deals",
  "matching",
  "auction",
  "shared",
  "client",
  "ci",
  "docs",
  "deps",
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", TYPES],
    "scope-enum": [2, "always", SCOPES],
  },
};
