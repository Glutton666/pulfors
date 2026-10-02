import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
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
  return body;
}

async function verifyMissingBuildFails() {
  const emptyDir = await mkdtemp(path.join(tmpdir(), "pulfors-missing-build-"));
  try {
    const child = spawn(process.execPath, [path.resolve("dist/server/index.js")], {
      cwd: emptyDir,
      env: { ...process.env, NODE_ENV: "production", PORT: String(port + 1) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Production startup did not reject the missing web build."));
      }, 10_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
    });
    if (result !== 1 || !stderr.includes("Web build missing or invalid")) {
      throw new Error(`Missing web build did not produce an explicit startup failure: ${stderr}`);
    }
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
}

async function verifyReferencedFiles(html) {
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], baseUrl))
    .filter((url) => url.origin === baseUrl && path.extname(url.pathname));
  if (!urls.some((url) => url.pathname.startsWith("/_expo/static/js/"))) {
    throw new Error("Web export has no Expo JavaScript bundle reference.");
  }
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`Web export asset unavailable: ${url.pathname} (${response.status}).`);
    }
  }
  for (const pathname of ["/_expo/static/js/missing.js", "/assets/missing.png", "/audio-worklets/missing.js"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    if (response.status !== 404) {
      throw new Error(`Missing asset ${pathname} must return 404, not SPA HTML.`);
    }
  }
}

async function verifyBuiltAppInBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  const loadedScripts = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
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
    await page.locator('[data-testid="mode-cycle-label"]').waitFor({ timeout: 20_000 });
    for (let i = 0; i < 8; i += 1) {
      const skip = page.getByText(/건너뛰기|Skip/i);
      if ((await skip.count()) === 0) break;
      await skip.first().click();
      await page.waitForTimeout(300);
    }
    if (process.argv.includes("--screenshot")) {
      await page.screenshot({ path: path.join(tmpdir(), "pulfors-built-web.jpg") });
    }
    // Global settings retain Profile; mode-specific settings intentionally don't.
    await page.locator('[data-testid="mode-cycle-label"]').click();
    await page.waitForTimeout(400);
    await page.mouse.click(page.viewportSize().width / 2 - 58, 86);
    await page.waitForTimeout(300);
    await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height * 0.75);
    await page.locator('[data-testid="menu-profile"]').click();
    const username = page.locator('[data-testid="settings-username"]');
    await username.fill("web-release-backup-check");
    await page.waitForFunction(() => localStorage.getItem("metronome_settings")?.includes("web-release-backup-check"));
    page.on("dialog", (dialog) => dialog.accept());
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-testid="settings-backup-export"]').click();
    const download = await downloadPromise;
    const backupJson = await readFile(await download.path(), "utf8");
    const backup = JSON.parse(backupJson);
    if (!backup.data?.metronome_settings?.includes("web-release-backup-check")) {
      throw new Error("Backup download did not include the locally saved profile.");
    }
    await username.fill("changed-after-export");
    await page.waitForFunction(() => localStorage.getItem("metronome_settings")?.includes("changed-after-export"));
    const pickerPromise = page.waitForEvent("filechooser");
    await page.locator('[data-testid="settings-backup-import"]').click();
    const picker = await pickerPromise;
    const reloadPromise = page.waitForEvent("framenavigated", {
      predicate: (frame) => frame === page.mainFrame(),
    });
    await picker.setFiles({
      name: "release-check.metronome.json",
      mimeType: "application/json",
      buffer: Buffer.from(backupJson),
    });
    await reloadPromise;
    await page.waitForFunction(() => localStorage.getItem("metronome_settings")?.includes("web-release-backup-check"));
    await page.locator('[data-testid="mode-cycle-label"]').waitFor({ timeout: 20_000 });
    if (consoleErrors.length > 0) {
      throw new Error(`Built web app reported browser errors:\n${consoleErrors.join("\n")}`);
    }
  } finally {
    await browser.close();
  }
}

try {
  await verifyMissingBuildFails();
  await waitForServer();
  await verifyReferencedFiles(await expectWebApp("/"));
  await expectWebApp("/index.html");
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
    `Web release check passed: missing-build guard, PORT, root, assets, SPA fallback, API boundary${verifyBrowserRuntime ? ", browser runtime, and backup round-trip" : ""}.`,
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