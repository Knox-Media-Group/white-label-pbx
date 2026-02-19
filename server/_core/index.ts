import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { webhookRouter } from "../webhooks";
import { telnyxWebhookRouter } from "../telnyx-webhooks";
import { retellWebhookRouter } from "../retell-webhooks";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { apiLimiter, authLimiter, webhookLimiter } from "../middleware/rate-limit";
import { securityHeaders, verifyTelnyxWebhook } from "../middleware/security";

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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Security headers
  app.use(securityHeaders);

  // Health check endpoint (no rate limit, no auth)
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      node: process.version,
      memory: process.memoryUsage(),
    });
  });

  // OAuth callback under /api/oauth/callback
  app.use("/api/oauth", authLimiter);
  registerOAuthRoutes(app);

  // SignalWire webhooks (legacy)
  app.use("/api/webhooks", webhookLimiter, webhookRouter);
  // Telnyx webhooks with signature verification
  app.use("/api/webhooks/telnyx", webhookLimiter, verifyTelnyxWebhook, telnyxWebhookRouter);
  // Retell AI webhooks
  app.use("/api/webhooks/retell", webhookLimiter, retellWebhookRouter);

  // tRPC API with rate limiting
  app.use(
    "/api/trpc",
    apiLimiter,
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
