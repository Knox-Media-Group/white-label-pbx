import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { sql } from "drizzle-orm";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

const scryptAsync = promisify(scrypt);

// Ensure passwordHash column exists in users table
async function ensurePasswordHashColumn(): Promise<boolean> {
  const dbConn = await db.getDb();
  if (!dbConn) return false;
  try {
    await dbConn.execute(sql`ALTER TABLE users ADD COLUMN passwordHash TEXT NULL`);
    console.log("[Local Auth] Added passwordHash column to users table");
    return true;
  } catch (error: any) {
    const msg = String(error?.message || error || "");
    // Column already exists — that's fine
    if (msg.includes("Duplicate column") || msg.includes("duplicate column") || error?.code === "ER_DUP_FIELDNAME") {
      return true;
    }
    console.error("[Local Auth] ALTER TABLE failed:", msg);
    return false;
  }
}

let migrationDone = false;

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

// Get admin user using raw SQL to avoid Drizzle ORM column mismatch issues
async function getAdminUserRaw(): Promise<{ id: number; openId: string; email: string | null; passwordHash: string | null; name: string | null } | null> {
  const dbConn = await db.getDb();
  if (!dbConn) return null;
  try {
    const result = await dbConn.execute(sql`SELECT id, openId, email, name, passwordHash FROM users WHERE role = 'admin' LIMIT 1`);
    const rows = (result as any)?.[0] || (result as any)?.rows || result;
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as any;
    }
    return null;
  } catch {
    // If passwordHash column doesn't exist yet, try without it
    try {
      const dbConn2 = await db.getDb();
      if (!dbConn2) return null;
      const result = await dbConn2.execute(sql`SELECT id, openId, email, name FROM users WHERE role = 'admin' LIMIT 1`);
      const rows = (result as any)?.[0] || (result as any)?.rows || result;
      if (Array.isArray(rows) && rows.length > 0) {
        return { ...rows[0], passwordHash: null } as any;
      }
    } catch {
      // DB is really broken
    }
    return null;
  }
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
      if (!migrationDone) {
        migrationDone = await ensurePasswordHashColumn();
      }
      const admin = await getAdminUserRaw();
      res.json({ needsSetup: !admin || !admin.passwordHash });
    } catch (error) {
      res.json({ needsSetup: true });
    }
  });

  // Initial admin setup — create admin account with password
  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    try {
      // Ensure migration
      if (!migrationDone) {
        const ok = await ensurePasswordHashColumn();
        if (!ok) {
          res.status(500).json({ error: "Database migration failed — could not add passwordHash column. Check server logs." });
          return;
        }
        migrationDone = true;
      }

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
      const existingAdmin = await getAdminUserRaw();
      if (existingAdmin?.passwordHash) {
        res.status(400).json({ error: "Admin account already exists. Use login instead." });
        return;
      }

      const passwordHash = await hashPassword(password);
      const openId = existingAdmin?.openId || `local_${randomBytes(16).toString("hex")}`;

      // Use raw SQL for insert/update to avoid Drizzle ORM schema sync issues
      const dbConn = await db.getDb();
      if (!dbConn) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      if (existingAdmin) {
        await dbConn.execute(
          sql`UPDATE users SET email = ${email}, name = ${name || "Admin"}, passwordHash = ${passwordHash}, loginMethod = 'local', lastSignedIn = NOW() WHERE id = ${existingAdmin.id}`
        );
      } else {
        await dbConn.execute(
          sql`INSERT INTO users (openId, name, email, passwordHash, loginMethod, role, lastSignedIn, createdAt, updatedAt) VALUES (${openId}, ${name || "Admin"}, ${email}, ${passwordHash}, 'local', 'admin', NOW(), NOW(), NOW())`
        );
      }

      // Check JWT_SECRET is configured
      if (!ENV.cookieSecret) {
        res.status(500).json({ error: "JWT_SECRET is not set in .env — cannot create session" });
        return;
      }

      // Create session
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "Admin",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true });
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error("[Local Auth] Setup failed:", msg, error);
      res.status(500).json({ error: `Setup failed: ${msg}` });
    }
  });

  // Local login with email + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      if (!migrationDone) {
        migrationDone = await ensurePasswordHashColumn();
      }

      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const dbConn = await db.getDb();
      if (!dbConn) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const result = await dbConn.execute(sql`SELECT id, openId, name, email, passwordHash, role FROM users WHERE email = ${email} LIMIT 1`);
      const rows = (result as any)?.[0] || (result as any)?.rows || result;
      const user = Array.isArray(rows) && rows.length > 0 ? rows[0] as any : null;

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await dbConn.execute(sql`UPDATE users SET lastSignedIn = NOW() WHERE id = ${user.id}`);

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "User",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error("[Local Auth] Login failed:", msg, error);
      res.status(500).json({ error: `Login failed: ${msg}` });
    }
  });
}
