import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { hasRole, type KnoxRole } from '@shared/rbac';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { writeAuditLog } from "./audit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/** Middleware factory: require at least `minRole` */
function requireRole(minRole: KnoxRole) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (!hasRole(ctx.user.role, minRole)) {
      writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email ?? undefined,
        userRole: ctx.user.role,
        action: `access_denied:${minRole}`,
        resource: opts.path ?? "unknown",
        outcome: "denied",
        ipAddress: ctx.req.ip ?? ctx.req.socket.remoteAddress ?? undefined,
      });

      throw new TRPCError({
        code: "FORBIDDEN",
        message: minRole === "admin" ? NOT_ADMIN_ERR_MSG : `Requires ${minRole} role or higher`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

/** viewer+ : read-only access */
export const viewerProcedure = t.procedure.use(requireRole("viewer"));
/** operator+ : day-to-day mutations */
export const operatorProcedure = t.procedure.use(requireRole("operator"));
/** admin only : destructive / config operations */
export const adminProcedure = t.procedure.use(requireRole("admin"));
