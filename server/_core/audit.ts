import type { InsertAuditLog } from "../../drizzle/schema";

/**
 * Fire-and-forget audit writer.
 * Persists to DB when available, always logs to stdout.
 */
export function writeAuditLog(entry: Omit<InsertAuditLog, "id" | "createdAt">): void {
  const record = {
    ...entry,
    createdAt: new Date(),
  };

  // Always emit structured log for syslog / SIEM ingestion
  console.log("[AUDIT]", JSON.stringify(record));

  // Async DB write - never blocks caller
  persistAudit(record).catch(err => {
    console.error("[AUDIT] DB write failed:", err);
  });
}

async function persistAudit(record: Omit<InsertAuditLog, "id">): Promise<void> {
  // Dynamic import to avoid circular dep with db.ts
  const { getDb } = await import("../db");
  const { auditLogs } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(record);
}
