import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8081",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  /**
   * CI에서 Expo 웹 앱을 자동으로 시작한다.
   * 이미 8081 포트에서 실행 중이면 재시작하지 않는다.
   * 로컬 개발 시에는 `expo start --web --port 8081` 을 별도로 실행해도 된다.
   */
  webServer: {
    command: "npx expo start --web --port 8081 --no-dev",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
