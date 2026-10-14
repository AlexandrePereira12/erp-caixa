import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta contra uma empresa REAL provisionada localmente (deploy/scripts/e2e.sh:
 * Nginx + web + api + banco, com dados de demonstração). Variáveis: E2E_BASE_URL,
 * E2E_ADMIN_EMAIL, E2E_ADMIN_SENHA. O banco é compartilhado entre os projetos: rodam em série, na
 * ordem abaixo (o fluxo completo primeiro, depois o celular), e cada arquivo cria os seus dados.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://e2e.localhost:18090",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testMatch: /fluxo-completo\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "celular", testMatch: /mobile\.spec\.ts/, dependencies: ["desktop"], use: { ...devices["Pixel 7"] } },
  ],
});
