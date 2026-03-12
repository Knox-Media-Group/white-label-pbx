# Knox Command Center - Security Upgrade

## Summary of Changes

### 1. RBAC (Role-Based Access Control)
- **Roles**: `viewer` (read-only), `operator` (day-to-day mutations), `admin` (full control)
- Legacy `user` role maps to `viewer` at runtime for backward compatibility
- New middleware: `viewerProcedure`, `operatorProcedure`, `adminProcedure`
- Destructive operations (delete) require `admin`
- Create/update operations require `operator+`
- Read operations require `viewer+` (any authenticated user)

### 2. Auth & Session Security
- Session TTL reduced from 1 year to 24h in production (configurable via `SESSION_TTL_MS`)
- JWT_SECRET enforced to be >= 32 characters in production
- `sessionVersion` column on users for forced session invalidation
- Cookie settings: `httpOnly`, `sameSite`, `secure` enforced

### 3. CORS
- Strict CORS middleware enforces `ALLOWED_ORIGINS` in production
- Development mode remains permissive
- Preflight (OPTIONS) handled correctly

### 4. Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (production only)

### 5. Startup Validation
- URL env vars validated at startup (must be valid http/https URLs)
- JWT_SECRET length enforced in production
- Redacted config logged at startup for ops visibility
- `/healthz` endpoint for load balancer health checks

### 6. Audit Logging
- All mutations logged with: user, action, resource, IP, user-agent, outcome
- Access denied attempts logged
- Login/logout events logged
- Structured JSON output to stdout for SIEM ingestion
- Persistent storage in `auditLogs` table
- Admin-only query endpoint: `auditLogs.list`

### 7. Metrics History & Alerts
- `metricsHistory` table for periodic metric snapshots
- `alertRules` table for configurable threshold alerts
- `alertEvents` table for fired alert instances
- Admin API endpoints for full CRUD on rules and events
- Stale-state threshold configurable via `STALE_THRESHOLD_MS`

### 8. No Arbitrary Command Execution
- Verified: no shell exec, eval, or arbitrary command execution in UI or backend
- All operations go through typed tRPC procedures with Zod validation

---

## Files Changed

| File | Change |
|------|--------|
| `drizzle/schema.ts` | Added viewer/operator roles, sessionVersion, auditLogs, metricsHistory, alertRules, alertEvents tables |
| `drizzle/0003_knox_security_upgrade.sql` | SQL migration for new tables and role expansion |
| `shared/rbac.ts` | NEW - Role definitions, normalizeRole, hasRole helper |
| `shared/const.ts` | No change (backward compatible) |
| `server/_core/trpc.ts` | New RBAC middleware: viewerProcedure, operatorProcedure, adminProcedure |
| `server/_core/audit.ts` | NEW - Fire-and-forget audit writer |
| `server/_core/env.ts` | Startup validation, session TTL, CORS config, URL validation |
| `server/_core/cors.ts` | NEW - Strict CORS middleware |
| `server/_core/index.ts` | Security headers, CORS, trust proxy, /healthz, startup logging |
| `server/_core/oauth.ts` | Audit logging on login/logout, configurable session TTL |
| `server/_core/sdk.ts` | Use configurable session TTL instead of ONE_YEAR_MS |
| `server/routers.ts` | Full RBAC upgrade, audit logging on all mutations, new audit/metrics/alerts endpoints |
| `server/db.ts` | DB operations for audit logs, metrics, alert rules, alert events |
| `.env.template` | NEW - Complete env var reference |
| `nginx.conf.example` | NEW - Production nginx config with rate limiting and security headers |

---

## Deployment Steps

### Pre-deployment
1. Back up the database
2. Review `.env.template` and update your `.env` file with new variables
3. Generate a strong JWT_SECRET: `openssl rand -hex 32`

### Database Migration
```bash
mysql -u root -p knox_pbx < drizzle/0003_knox_security_upgrade.sql
```

### Deploy
```bash
pnpm install
pnpm build
pnpm start
```

### Post-deployment verification
1. Check startup logs for `[Knox] Startup configuration:` output
2. Hit `/healthz` to verify server is running
3. Test login flow
4. Verify audit logs are being written: check stdout and `auditLogs` table

### Rollback Steps
1. Stop the application
2. Revert to previous code: `git checkout master`
3. The DB migration is backward-compatible (new tables/columns only), but if needed:
   ```sql
   -- Revert role enum (only if no viewer/operator rows exist)
   ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user','admin') NOT NULL DEFAULT 'user';
   ALTER TABLE `users` DROP COLUMN IF EXISTS `sessionVersion`;
   DROP TABLE IF EXISTS `alertEvents`;
   DROP TABLE IF EXISTS `alertRules`;
   DROP TABLE IF EXISTS `metricsHistory`;
   DROP TABLE IF EXISTS `auditLogs`;
   ```
4. Rebuild and restart: `pnpm build && pnpm start`

---

## Test Checklist

| # | Test | Expected | Pass/Fail |
|---|------|----------|-----------|
| 1 | Server starts with valid env | Startup logs show config, no errors | |
| 2 | Server fails with short JWT_SECRET in production | Error: "JWT_SECRET must be at least 32 characters" | |
| 3 | Server fails with invalid OAUTH_SERVER_URL | Error about invalid URL | |
| 4 | `/healthz` returns 200 | `{"ok":true,"ts":...}` | |
| 5 | Login via OAuth flow | Redirects to OAuth, returns session cookie | |
| 6 | `auth.me` returns user with role | Role is viewer/operator/admin | |
| 7 | Viewer cannot create customer | FORBIDDEN error | |
| 8 | Operator can create SIP endpoint | Returns `{ id }` | |
| 9 | Operator cannot delete SIP endpoint | FORBIDDEN error | |
| 10 | Admin can delete SIP endpoint | Returns `{ success: true }` | |
| 11 | Admin can query audit logs | Returns array of audit entries | |
| 12 | Audit log written on customer create | Entry in `auditLogs` table + stdout | |
| 13 | Login event appears in audit log | `action: "login"` in auditLogs | |
| 14 | Access denied appears in audit log | `outcome: "denied"` in auditLogs | |
| 15 | CORS blocks unknown origin in production | No `Access-Control-Allow-Origin` header | |
| 16 | CORS allows configured origin | Header present with correct origin | |
| 17 | Security headers present in response | X-Content-Type-Options, X-Frame-Options, etc. | |
| 18 | Session expires after SESSION_TTL_MS | Cookie expires, auth.me returns null | |
| 19 | Alert rule CRUD works | Create, read, update, delete alert rules | |
| 20 | Metrics history records and queries | Record a metric, retrieve via history endpoint | |
| 21 | Legacy "user" role users treated as viewers | Existing users with role="user" can read but not mutate | |
| 22 | Customer access isolation | Customer user cannot access other customer's data | |

---

## Security Checklist

| # | Item | Status |
|---|------|--------|
| 1 | No arbitrary command execution in UI or backend | PASS |
| 2 | JWT_SECRET >= 32 chars enforced in production | PASS |
| 3 | Session TTL reduced to 24h (configurable) | PASS |
| 4 | CORS enforced in production | PASS |
| 5 | Security headers (HSTS, X-Frame-Options, etc.) | PASS |
| 6 | All mutations require operator+ role | PASS |
| 7 | Destructive operations require admin role | PASS |
| 8 | Audit logging on all state changes | PASS |
| 9 | Access denied attempts logged | PASS |
| 10 | Login/logout events logged | PASS |
| 11 | URL env vars validated at startup | PASS |
| 12 | No secrets logged (redacted in startup output) | PASS |
| 13 | httpOnly cookies | PASS |
| 14 | Input validation via Zod on all endpoints | PASS |
| 15 | Customer data isolation enforced | PASS |
| 16 | Rate limiting in nginx config | PASS |
| 17 | CSP headers in nginx config | PASS |
| 18 | TLS 1.2+ enforced in nginx config | PASS |

---

## Known Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Legacy "user" role rows in DB | Migration script converts to "viewer"; enum keeps "user" for compatibility |
| 2 | Audit log table growth | Implement periodic archival/purging (cron job recommended for >90 day logs) |
| 3 | CORS config requires manual ALLOWED_ORIGINS | Documented in .env.template; startup warns if not set |
| 4 | Session invalidation requires DB lookup for sessionVersion | Acceptable latency; can add Redis cache later |
| 5 | Alert evaluation is not automated | Alert rules are stored but evaluation loop needs separate cron/worker to trigger |
| 6 | Metrics collection is manual via API | Future: add periodic metric collection worker |
