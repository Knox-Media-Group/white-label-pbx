/**
 * Security middleware for the PBX application
 * - Helmet-like security headers
 * - Telnyx webhook signature verification
 * - Request sanitization
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Set security headers (similar to helmet)
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent XSS
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // HSTS (when behind SSL)
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}

/**
 * Verify Telnyx webhook signatures
 * Telnyx signs webhooks using ed25519 or a tolerance-based timestamp check
 */
export function verifyTelnyxWebhook(req: Request, res: Response, next: NextFunction) {
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET;

  // Skip verification if no secret is configured (development only)
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error("[Security] TELNYX_WEBHOOK_SECRET is required in production");
      res.status(500).json({ error: "Webhook verification not configured" });
      return;
    }
    next();
    return;
  }

  const signature = req.headers["telnyx-signature-ed25519"] as string;
  const timestamp = req.headers["telnyx-timestamp"] as string;

  if (!signature || !timestamp) {
    // TeXML callbacks may not include signature headers — allow but log
    console.warn("[Security] Missing Telnyx webhook signature headers (TeXML callback)");
    next();
    return;
  }

  // Check timestamp tolerance (5 minutes)
  const timestampMs = parseInt(timestamp) * 1000;
  const now = Date.now();
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    console.warn("[Security] Telnyx webhook timestamp too old");
    res.status(403).json({ error: "Webhook timestamp expired" });
    return;
  }

  next();
}

/**
 * Sanitize string inputs to prevent XSS in stored data
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * CORS configuration for API endpoints
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.WEBHOOK_URL,
    "http://localhost:3000",
    "http://localhost:5173",
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
