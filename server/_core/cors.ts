import type { Request, Response, NextFunction } from "express";
import { ENV } from "./env";

/**
 * Strict CORS middleware.
 * - Development: allows all origins
 * - Production: only origins listed in ALLOWED_ORIGINS
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (!ENV.isProduction) {
    // Permissive in dev
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  } else if (origin && ENV.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
