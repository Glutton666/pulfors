import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;
const isProduction = process.env.NODE_ENV === "production";

export function getTrustProxyHops(): number {
  const configured = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "", 10);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 5) {
    return configured;
  }
  // Proxy topology must be declared by deployment configuration. Trusting
  // forwarding headers by default lets a direct client choose its own req.ip.
  return 0;
}

function configuredHostnames(): string[] {
  return [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
  ]
    .map((value) => value?.trim().toLowerCase().replace(/^https?:\/\//, ""))
    .filter((value): value is string => Boolean(value));
}

function isLocalOrigin(origin: string): boolean {
  return !isProduction && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin);
}

export function isAllowedCorsOrigin(origin: string): boolean {
  if (isLocalOrigin(origin)) return true;
  return configuredHostnames().some((hostname) => origin === `https://${hostname}`);
}

export function isSafePublicHost(host: string | undefined): boolean {
  if (!host || host.length > 255 || host.includes(",") || /[\r\n<>"'`\\/\s]/.test(host)) {
    return false;
  }
  if (!/^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(host)) {
    return false;
  }
  const normalizedHost = host.toLowerCase();
  if (configuredHostnames().some((configured) => configured === normalizedHost)) {
    return true;
  }
  const hostname = normalizedHost.replace(/:\d{1,5}$/, "").replace(/^\[|\]$/g, "");
  return !isProduction && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    if (origin && isAllowedCorsOrigin(origin)) {
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      if (origin && !isAllowedCorsOrigin(origin)) {
        return res.status(403).json({ error: "Origin not allowed" });
      }
      return res.sendStatus(200);
    }

    if (origin && !isAllowedCorsOrigin(origin) && req.path.startsWith("/api")) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    next();
  });
}

export function setupSecurityHeaders(app: express.Application) {
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self)");
    next();
  });
}

export function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "7mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const trustsForwardedHeaders = getTrustProxyHops() > 0;
  const forwardedProto = trustsForwardedHeaders ? req.header("x-forwarded-proto") : undefined;
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : req.protocol === "http" && !isProduction ? "http" : "https";
  const forwardedHost = trustsForwardedHeaders ? req.header("x-forwarded-host") : undefined;
  const requestedHost = forwardedHost && !forwardedHost.includes(",") ? forwardedHost : req.get("host");
  const fallbackHost = configuredHostnames()[0] ?? (isProduction ? "localhost" : "localhost:5000");
  const host = isSafePublicHost(requestedHost) ? requestedHost! : fallbackHost;
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application): {
  landingPageTemplate: string;
  appName: string;
} {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      const staticIndexPath = path.resolve(
        process.cwd(),
        "static-build",
        "index.html",
      );
      if (fs.existsSync(staticIndexPath)) {
        return res.sendFile(staticIndexPath);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");

  return { landingPageTemplate, appName };
}

export function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      type?: string;
      message?: string;
    };

    const candidateStatus = Number(error.status || error.statusCode);
    const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
    const message = error.type === "entity.too.large" || status === 413
      ? "Request body too large"
      : error.type === "entity.parse.failed" || status === 400
        ? "Invalid request body"
        : "Internal server error";

    console.error("Request failed:", {
      method: _req.method,
      path: _req.path,
      status,
      error: error.message,
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

export async function startServer() {
  app.set("trust proxy", getTrustProxyHops());
  setupSecurityHeaders(app);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  const { landingPageTemplate, appName } = configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  // SPA catch-all: serve static-build/index.html for any non-API path that
  // wasn't handled above (client-side routing, hard refresh, bookmarks).
  // Falls back to the landing page when static-build hasn't been built yet.
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const staticIndexPath = path.resolve(
      process.cwd(),
      "static-build",
      "index.html",
    );
    if (fs.existsSync(staticIndexPath)) {
      res.sendFile(staticIndexPath);
      return;
    }
    serveLandingPage({ req, res, landingPageTemplate, appName });
  });

  setupErrorHandler(app);

  const isProd = process.env.NODE_ENV === "production";
  const defaultPort = isProd ? "8081" : "5000";
  const envPort = process.env.PORT;
  const port = isProd ? 8081 : parseInt(envPort || defaultPort, 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  void startServer();
}
