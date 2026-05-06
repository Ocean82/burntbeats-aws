/** @type { import("eslint").Linter.FlatConfig[] } */
export default [
  { ignores: ["**/*.md", "node_modules/**"] },
  { languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { process: "readonly", console: "readonly", Buffer: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", fetch: "readonly" } } },
  { rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } },
];
