import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import process from "node:process";

const port = 5197;
const baseUrl = `http://127.0.0.1:${port}`;
const verifyBrowserRuntime = process.argv.includes("--browser");

await access("static-build/index.html");
await access("dist/server/index.js");

const server = spawn(process.execPath, ["dist/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited early (${server.exitCode}).\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/time`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Production server did not listen on PORT=${port}.\n${output}`);
}

async function expectWebApp(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.text();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${pathname} did not return the web app (${response.status}).`);
  }
  if (!body.includes('id="root"')) {
    throw new Error(`${pathname} returned HTML without the Expo root element.`);
  }
}

async function verifyBuiltAppInBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const loadedScripts = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/_expo/static/js/")) {
      loadedScripts.push({ status: response.status(), url: response.url() });
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelector("#root")?.childElementCount,
      undefined,
      { timeout: 15_000 },
    );
    if (!loadedScripts.some((script) => script.status >= 200 && script.status < 300)) {
      throw new Error("The built web app did not load an Expo JavaScript bundle.");
    }
    if (consoleErrors.length > 0) {
      throw new Error(`Built web app reported browser errors:\n${consoleErrors.join("\n")}`);
    }
  } finally {
    await browser.close();
  }
}

try {
  await waitForServer();
  await expectWebApp("/");
  await expectWebApp("/score");

  const apiResponse = await fetch(`${baseUrl}/api/time`);
  if (!apiResponse.ok || typeof (await apiResponse.json()).now !== "number") {
    throw new Error("/api/time did not return the expected JSON response.");
  }

  const missingApiResponse = await fetch(`${baseUrl}/api/release-check-missing`);
  if (
    missingApiResponse.status !== 404
    || missingApiResponse.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error("Unknown API routes must stay inside the JSON API boundary.");
  }

  if (verifyBrowserRuntime) {
    await verifyBuiltAppInBrowser();
  }

  console.log(
    `Web release check passed: PORT, root, SPA fallback, API boundary${verifyBrowserRuntime ? ", and built browser runtime" : ""}.`,
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) {
      resolve();
      return;
    }
    server.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}