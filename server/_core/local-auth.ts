import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const keyBuffer = Buffer.from(key, "hex");
  return timingSafeEqual(derived, keyBuffer);
}

function isOAuthConfigured(): boolean {
  return Boolean(ENV.oAuthServerUrl && ENV.appId);
}

export function registerLocalAuthRoutes(app: Express) {
  // Check if local auth is needed (OAuth not configured)
  app.get("/api/auth/mode", (_req: Request, res: Response) => {
    const oauthConfigured = isOAuthConfigured();
    res.json({ mode: oauthConfigured ? "oauth" : "local" });
  });

  // Check if initial admin setup is needed
  app.get("/api/auth/setup-status", async (_req: Request, res: Response) => {
    try {
      const admin = await db.getAdminUser();
      res.json({ needsSetup: !admin || !admin.passwordHash });
    } catch (error) {
      // If DB is not available, setup is needed
      res.json({ needsSetup: true });
    }
  });

  // Initial admin setup — create admin account with password
  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    try {
      // Block if OAuth is configured
      if (isOAuthConfigured()) {
        res.status(400).json({ error: "Local auth is disabled when OAuth is configured" });
        return;
      }

      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      // Check if admin already exists with a password
      const existingAdmin = await db.getAdminUser();
      if (existingAdmin?.passwordHash) {
        res.status(400).json({ error: "Admin account already exists. Use /api/auth/login instead." });
        return;
      }

      const passwordHash = await hashPassword(password);
      const openId = `local_${randomBytes(16).toString("hex")}`;

      // Create or update admin user
      await db.upsertUser({
        openId: existingAdmin?.openId || openId,
        name: name || "Admin",
        email,
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      });

      // Get the user to update password
      const user = await db.getUserByEmail(email);
      if (user) {
        await db.updateUserPassword(user.id, passwordHash);
      }

      // Create session
      const sessionToken = await sdk.createSessionToken(
        existingAdmin?.openId || openId,
        { name: name || "Admin", expiresInMs: ONE_YEAR_MS }
      );

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true });
    } catch (error) {
      console.error("[Local Auth] Setup failed:", error);
      res.status(500).json({ error: "Setup failed" });
    }
  });

  // Local login with email + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "User",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      console.error("[Local Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
