import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/ui",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: { viewport: { width: 1360, height: 860 }, trace: "retain-on-failure" },
  projects: [
    { name: "dark", use: { colorScheme: "dark" } },
    { name: "light", use: { colorScheme: "light" } },
  ],
});
