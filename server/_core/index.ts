import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { webhookRouter } from "../webhooks";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { corsMiddleware } from "./cors";
import { ENV } from "./env"; // triggers startup validation

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/** Log startup configuration (redacted) for ops visibility */
function logStartupConfig(): void {
  console.log("[Knox] Startup configuration:");
  console.log(`  NODE_ENV          = ${process.env.NODE_ENV ?? "development"}`);
  console.log(`  SESSION_TTL_MS    = ${ENV.sessionTtlMs}`);
  console.log(`  ALLOWED_ORIGINS   = ${ENV.allowedOrigins.length > 0 ? ENV.allowedOrigins.join(", ") : "(unrestricted - dev)"}`);
  console.log(`  OAUTH_SERVER_URL  = ${ENV.oAuthServerUrl ? "(set)" : "(not set)"}`);
  console.log(`  DATABASE_URL      = ${ENV.databaseUrl ? "(set)" : "(not set)"}`);
  console.log(`  JWT_SECRET        = ${ENV.cookieSecret ? `(set, ${ENV.cookieSecret.length} chars)` : "(not set)"}`);
  console.log(`  STALE_THRESHOLD   = ${ENV.staleThresholdMs}ms`);
}

async function startServer() {
  logStartupConfig();

  const app = express();
  const server = createServer(app);

  // Trust proxy for correct IP behind nginx/load-balancer
  app.set("trust proxy", 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (ENV.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // CORS
  app.use(corsMiddleware);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Health check (unauthenticated, for load balancer)
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // SignalWire webhooks
  app.use("/api/webhooks", webhookRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
