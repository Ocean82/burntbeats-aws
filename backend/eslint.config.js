/** @type { import("eslint").Linter.FlatConfig[] } */
export default [
  { ignores: ["**/*.md"] },
  { languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { process: "readonly", console: "readonly", Buffer: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } } },
  { rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } },
];
