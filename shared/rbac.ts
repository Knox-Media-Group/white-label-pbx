/**
 * Knox Command Center - RBAC definitions
 *
 * Role hierarchy: admin > operator > viewer
 * Legacy "user" role is treated as "viewer" at runtime.
 */

export type KnoxRole = "viewer" | "operator" | "admin";

const ROLE_RANK: Record<string, number> = {
  user: 0,     // legacy
  viewer: 0,
  operator: 1,
  admin: 2,
};

/** Normalize legacy "user" to "viewer" */
export function normalizeRole(role: string | null | undefined): KnoxRole {
  if (role === "admin") return "admin";
  if (role === "operator") return "operator";
  return "viewer";
}

/** Returns true when the user's role is >= the required role */
export function hasRole(userRole: string | null | undefined, requiredRole: KnoxRole): boolean {
  return (ROLE_RANK[userRole ?? "viewer"] ?? 0) >= (ROLE_RANK[requiredRole] ?? 0);
}
