function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`[ENV] Missing required environment variable: ${key}`);
  }
  return value;
}

function validateUrl(key: string, value: string): string {
  if (!value) return value;
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) {
      throw new Error(`[ENV] ${key} must use http or https protocol, got: ${u.protocol}`);
    }
    return value;
  } catch (err: any) {
    if (err.message.startsWith("[ENV]")) throw err;
    throw new Error(`[ENV] ${key} is not a valid URL: ${value}`);
  }
}

const isProduction = process.env.NODE_ENV === "production";

// In production, enforce that JWT_SECRET is set and not a weak default
const cookieSecret = process.env.JWT_SECRET ?? "";
if (isProduction && (!cookieSecret || cookieSecret.length < 32)) {
  throw new Error(
    "[ENV] JWT_SECRET must be at least 32 characters in production. Generate with: openssl rand -hex 32"
  );
}

// Session TTL: default 24h in prod, 7d in dev
const sessionTtlMs = parseInt(process.env.SESSION_TTL_MS ?? (isProduction ? "86400000" : "604800000"), 10);

// CORS: in production, ALLOWED_ORIGINS must be set
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.warn("[ENV] ALLOWED_ORIGINS not set - CORS will reject all cross-origin requests in production");
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret,
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: validateUrl("OAUTH_SERVER_URL", process.env.OAUTH_SERVER_URL ?? ""),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: validateUrl("BUILT_IN_FORGE_API_URL", process.env.BUILT_IN_FORGE_API_URL ?? ""),
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  sessionTtlMs,
  allowedOrigins,
  // Stale-state threshold: data older than this (ms) shown with warning (default 5 min)
  staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS ?? "300000", 10),
};
