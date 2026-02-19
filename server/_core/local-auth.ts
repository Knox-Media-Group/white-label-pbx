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

/**
 * Create a separate local_credentials table instead of altering users.
 * CREATE TABLE IF NOT EXISTS is idempotent and avoids ALTER TABLE issues.
 */
async function ensureLocalCredentialsTable(): Promise<boolean> {
  const dbConn = await db.getDb();
  if (!dbConn) {
    console.error("[Local Auth] Database not available");
    return false;
  }
  try {
    await dbConn.execute(sql`
      CREATE TABLE IF NOT EXISTS local_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(320) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (error: any) {
    const msg = String(error?.message || error || "");
    console.error("[Local Auth] CREATE TABLE local_credentials failed:", msg);
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

// Get admin user joined with local_credentials
async function getAdminWithCredentials(dbConn: any): Promise<{
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
} | null> {
  try {
    const result = await dbConn.execute(sql`
      SELECT u.id, u.openId, u.email, u.name, lc.password_hash as passwordHash
      FROM users u
      LEFT JOIN local_credentials lc ON lc.user_id = u.id
      WHERE u.role = 'admin'
      LIMIT 1
    `);
    const rows = (result as any)?.[0] || (result as any)?.rows || result;
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as any;
    }
    return null;
  } catch (error: any) {
    console.error("[Local Auth] getAdminWithCredentials failed:", error?.message);
    return null;
  }
}

// Get user by email joined with local_credentials
async function getUserByEmailWithCredentials(dbConn: any, email: string): Promise<{
  id: number;
  openId: string;
  email: string;
  name: string | null;
  role: string;
  passwordHash: string | null;
} | null> {
  try {
    const result = await dbConn.execute(sql`
      SELECT u.id, u.openId, u.email, u.name, u.role, lc.password_hash as passwordHash
      FROM users u
      LEFT JOIN local_credentials lc ON lc.user_id = u.id
      WHERE u.email = ${email}
      LIMIT 1
    `);
    const rows = (result as any)?.[0] || (result as any)?.rows || result;
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as any;
    }
    return null;
  } catch (error: any) {
    console.error("[Local Auth] getUserByEmailWithCredentials failed:", error?.message);
    return null;
  }
}

async function ensureMigration(): Promise<boolean> {
  if (migrationDone) return true;
  migrationDone = await ensureLocalCredentialsTable();
  return migrationDone;
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
      const ok = await ensureMigration();
      if (!ok) {
        res.json({ needsSetup: true });
        return;
      }
      const dbConn = await db.getDb();
      if (!dbConn) {
        res.json({ needsSetup: true });
        return;
      }
      const admin = await getAdminWithCredentials(dbConn);
      res.json({ needsSetup: !admin || !admin.passwordHash });
    } catch (error) {
      res.json({ needsSetup: true });
    }
  });

  // Initial admin setup — create admin account with password
  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    try {
      // Ensure local_credentials table
      const ok = await ensureMigration();
      if (!ok) {
        res.status(500).json({ error: "Database migration failed — could not create local_credentials table. Check server logs and DATABASE_URL." });
        return;
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

      const dbConn = await db.getDb();
      if (!dbConn) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      // Check if admin already has credentials
      const existingAdmin = await getAdminWithCredentials(dbConn);
      if (existingAdmin?.passwordHash) {
        res.status(400).json({ error: "Admin account already exists. Use login instead." });
        return;
      }

      const passwordHash = await hashPassword(password);
      const openId = existingAdmin?.openId || `local_${randomBytes(16).toString("hex")}`;

      let userId: number;

      if (existingAdmin) {
        // Update existing admin user's email/name
        userId = existingAdmin.id;
        await dbConn.execute(
          sql`UPDATE users SET email = ${email}, name = ${name || "Admin"}, loginMethod = 'local', lastSignedIn = NOW() WHERE id = ${userId}`
        );
      } else {
        // Insert new admin user
        const insertResult = await dbConn.execute(
          sql`INSERT INTO users (openId, name, email, loginMethod, role, lastSignedIn, createdAt, updatedAt) VALUES (${openId}, ${name || "Admin"}, ${email}, 'local', 'admin', NOW(), NOW(), NOW())`
        );
        // Get the inserted user ID
        const insertRows = (insertResult as any)?.[0] || insertResult;
        userId = (insertRows as any)?.insertId;
        if (!userId) {
          // Fetch by openId
          const fetchResult = await dbConn.execute(sql`SELECT id FROM users WHERE openId = ${openId} LIMIT 1`);
          const fetchRows = (fetchResult as any)?.[0] || fetchResult;
          userId = Array.isArray(fetchRows) && fetchRows.length > 0 ? fetchRows[0].id : 0;
        }
      }

      if (!userId) {
        res.status(500).json({ error: "Failed to create user record in database" });
        return;
      }

      // Insert or update credentials
      await dbConn.execute(
        sql`INSERT INTO local_credentials (user_id, email, password_hash) VALUES (${userId}, ${email}, ${passwordHash}) ON DUPLICATE KEY UPDATE password_hash = ${passwordHash}`
      );

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
      await ensureMigration();

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

      const user = await getUserByEmailWithCredentials(dbConn, email);

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
