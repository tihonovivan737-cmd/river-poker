import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5181/poker/",
    channel:
      process.env.PW_CHANNEL ||
      (process.platform === "win32" ? "chrome" : undefined),
  },
  webServer: [
    {
      command: "node --import tsx server/index.ts",
      env: { PORT: "3011" },
      url: "http://127.0.0.1:3011",
    },
    {
      command: "npm run build -- --outDir dist-e2e && node tests/preview.mjs",
      env: { VITE_SERVER_URL: "http://127.0.0.1:3011" },
      url: "http://127.0.0.1:5181/poker/",
    },
  ],
});
