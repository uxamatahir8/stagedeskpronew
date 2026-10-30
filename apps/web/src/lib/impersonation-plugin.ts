// "Log in as": a platform admin opens a real session as another user, so the
// app (server pages and the Better Auth client alike) behaves exactly as it does
// for them. Follows Better Auth's admin-plugin impersonation, but checks our
// own platformRole. No server-only guard: auth-config imports it, and the
// Better Auth CLI loads that file.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sessionMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

/** How long a "log in as" session lasts before the admin has to start again. */
export const IMPERSONATION_SECONDS = 60 * 60;

/**
 * What an admin can't do as someone else: these would change how the real
 * person signs in, or lock them out of their own account.
 */
const blockedPaths = ["/change-password", "/set-password", "/change-email", "/delete-user", "/revoke-session", "/revoke-sessions", "/revoke-other-sessions", "/unlink-account"];
const blocked = (path: string) => blockedPaths.includes(path) || path.startsWith("/two-factor/");

export const impersonation = () =>
  ({
    id: "impersonation",
    schema: {
      session: {
        fields: {
          impersonatedBy: { type: "string", required: false, input: false },
        },
      },
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => blocked(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if ((session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy) {
              throw new APIError("FORBIDDEN", { code: "IMPERSONATION_BLOCKED", message: "Not available while logged in as someone else." });
            }
          }),
        },
      ],
    },
    endpoints: {
      startImpersonation: createAuthEndpoint(
        "/impersonation/start",
        { method: "POST", body: z.object({ userId: z.string().min(1).max(64) }), use: [sessionMiddleware] },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          if ((user as { platformRole?: string | null }).platformRole !== "platform_admin") {
            throw new APIError("FORBIDDEN", { code: "NOT_PLATFORM_ADMIN", message: "Only platform admins can log in as someone else." });
          }
          if ((session as { impersonatedBy?: string | null }).impersonatedBy) {
            throw new APIError("BAD_REQUEST", { code: "ALREADY_IMPERSONATING", message: "Return to your own account first." });
          }
          if (ctx.body.userId === user.id) throw new APIError("BAD_REQUEST", { code: "SELF", message: "That's you." });
          const target = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (!target) throw new APIError("NOT_FOUND", { code: "USER_NOT_FOUND", message: "User not found." });

          // The session hook still refuses disabled accounts.
          const created = await ctx.context.internalAdapter.createSession(
            target.id,
            true,
            { impersonatedBy: user.id, expiresAt: new Date(Date.now() + IMPERSONATION_SECONDS * 1000) },
            true,
          );
          if (!created) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not start the session." });

          // Keep the admin's own session in a signed cookie, so returning needs no password.
          const dontRemember = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
          const adminCookie = ctx.context.createAuthCookie("admin_session");
          deleteSessionCookie(ctx);
          await ctx.setSignedCookie(adminCookie.name, `${session.token}:${dontRemember ?? ""}`, ctx.context.secret, ctx.context.authCookies.sessionToken.attributes);
          await setSessionCookie(ctx, { session: created, user: target }, true);
          return ctx.json({ userId: target.id });
        },
      ),

      stopImpersonation: createAuthEndpoint("/impersonation/stop", { method: "POST", requireHeaders: true }, async (ctx) => {
        const current = await getSessionFromCtx(ctx);
        const adminId = (current?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy;
        if (!current || !adminId) throw new APIError("BAD_REQUEST", { code: "NOT_IMPERSONATING", message: "You're not logged in as someone else." });

        const adminCookie = ctx.context.createAuthCookie("admin_session");
        const [adminToken, dontRemember] = ((await ctx.getSignedCookie(adminCookie.name, ctx.context.secret)) || "").split(":");
        const admin = adminToken ? await ctx.context.internalAdapter.findSession(adminToken) : null;
        await ctx.context.internalAdapter.deleteSession(current.session.token);
        expireCookie(ctx, adminCookie);
        // The admin's own session must belong to the admin who started this one; otherwise just sign out.
        if (!admin || admin.session.userId !== adminId) {
          deleteSessionCookie(ctx);
          return ctx.json({ restored: false, adminId });
        }
        await setSessionCookie(ctx, admin, !!dontRemember);
        // The "log in as" session was a browser session; the admin's own may not have been.
        if (!dontRemember) expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
        return ctx.json({ restored: true, adminId });
      }),
    },
  }) satisfies BetterAuthPlugin;
