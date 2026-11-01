// Auth configuration. Import `auth` from "./auth" in app code; this file has no
// server-only guard so the Better Auth CLI can load it to generate the schema.
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization, twoFactor } from "better-auth/plugins";
import { createTranslator } from "next-intl";
import { passwordProblem, passwordRules, withinLimit, localePrefix } from "@stagedesk/core";
import { agencyBilling, agencyDeskUserIds, agencyUsage, confirmInvitationSeat, confirmJoinedSeat, confirmMemberSeat, confirmPendingForEmail, getSetting, notify, prisma, takesStaffSeat } from "@stagedesk/db";
import type { EmailLocale } from "@stagedesk/emails";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { ac, organizationRoles } from "./auth-roles";
import { impersonation } from "./impersonation-plugin";
import { deliver } from "./deliver";

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

const roleLabels: Record<EmailLocale, Record<string, string>> = {
  nl: { agency_owner: "eigenaar", agency_admin: "beheerder", agency_staff: "medewerker", artist: "artiest", customer: "klant" },
  en: { agency_owner: "owner", agency_admin: "admin", agency_staff: "staff member", artist: "artist", customer: "customer" },
};

/** Team roles that can be invited. Customers are added from the customers page. */
const invitableRoles = new Set<string>(["agency_admin", "agency_staff", "artist"]);
/** Roles a team member can be moved between (owner is further limited to owners by Better Auth). */
const assignableRoles = new Set<string>(["agency_owner", "agency_admin", "agency_staff", "artist"]);

// Callbacks receive the base user type; our `locale` field is there at runtime.
function localeOf(user: object | null | undefined): EmailLocale {
  return user && "locale" in user && user.locale === "nl" ? "nl" : "en";
}

/** Locale-aware app URL: English has no prefix, Dutch lives under /nl. */
function appPath(locale: EmailLocale, path: string) {
  return `${appUrl}${localePrefix(locale)}${path}`;
}

const billingText = (locale: EmailLocale) => createTranslator({ locale, messages: locale === "en" ? en : nl, namespace: "billing" });

/** All staff seats of the plan are taken. `code` lets callers show it in the viewer's language. */
function seatsFull(max: number, locale: EmailLocale) {
  const t = billingText(locale);
  return new APIError("FORBIDDEN", { message: t("limitReached", { max: String(max), limit: t("limit_maxStaff") }), code: "STAFF_SEATS_FULL", max });
}


const devLimit = (max: number) => (process.env.NODE_ENV === "production" ? max : max * 20);

export const auth = betterAuth({
  appName: "StageDesk",
  baseURL: appUrl,
  database: prismaAdapter(prisma, { provider: "mysql" }),

  // The same password rules as the forms, for every way a password is set.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Before launch only invited people sign up through the form; server-side calls
      // (a partner application) have no request and are allowed.
      if (ctx.path === "/sign-up/email" && ctx.request) {
        const { waitlistMode } = await getSetting("site.general");
        const email = String((ctx.body as Record<string, unknown> | undefined)?.["email"] ?? "").trim().toLowerCase();
        if (waitlistMode && !(await prisma.invitation.findFirst({ where: { email, status: "pending", expiresAt: { gt: new Date() } }, select: { id: true } }))) {
          throw new APIError("FORBIDDEN", { code: "WAITLIST_ONLY", message: "Sign-up is closed while the waitlist is open." });
        }
      }
      const field = ctx.path === "/sign-up/email" ? "password" : ctx.path === "/reset-password" || ctx.path === "/change-password" ? "newPassword" : null;
      if (!field) return;
      const value = (ctx.body as Record<string, unknown> | undefined)?.[field];
      const problem = typeof value === "string" ? passwordProblem(value) : "short";
      if (problem) throw new APIError("BAD_REQUEST", { code: `PASSWORD_${problem.toUpperCase()}`, message: `Password rule: ${problem}` });
    }),
  },

  user: {
    additionalFields: {
      // Set by seed/admin tools only; never accepted from a form.
      platformRole: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, defaultValue: "en", input: true },
      phone: { type: "string", required: false, input: true },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: passwordRules.min,
    maxPasswordLength: passwordRules.max,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      deliver({ kind: "resetPassword", to: user.email, params: { locale: localeOf(user), name: user.name, url } });
    },
    // The link was mailed to the account's address, so using it confirms that address. Accounts
    // created for someone (agency owners, admins) start unconfirmed; without this their first
    // password sign-in would be refused. An admin email change voids open links (updateUserByAdmin).
    onPasswordReset: async ({ user }) => {
      if (!user.emailVerified) await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      deliver({ kind: "verifyEmail", to: user.email, params: { locale: localeOf(user), name: user.name, url } });
    },
    // A newsletter box ticked at sign-up is confirmed by verifying the address.
    afterEmailVerification: async (user) => {
      await confirmPendingForEmail(user.email, user.id);
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      // Support mode for platform admins; written only by the server (lib/support.ts).
      supportOrganizationId: { type: "string", required: false, input: false },
    },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      // Per IP: high enough for an office of agency staff behind one address.
      // In development everything comes from localhost (you, scripts, e2e tests), so 20x.
      "/sign-in/email": { window: 60, max: devLimit(10) },
      "/sign-up/email": { window: 60, max: devLimit(3) },
      "/email-otp/send-verification-otp": { window: 300, max: devLimit(3) },
      "/sign-in/email-otp": { window: 60, max: devLimit(5) },
      "/request-password-reset": { window: 300, max: devLimit(3) },
      "/two-factor/verify-totp": { window: 60, max: devLimit(5) },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // A user disabled by the platform admin can't start a new session, whatever the sign-in method.
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true } });
          if (user?.disabledAt) throw new APIError("FORBIDDEN", { message: "Account disabled", code: "ACCOUNT_DISABLED" });
        },
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles: organizationRoles,
      creatorRole: "agency_owner",
      organizationLimit: 1,
      // Every booking customer is a member (role customer), so Better Auth's default cap of 100
      // members made accepting any invitation fail with a 403 once an agency had ~100 customers.
      // Team seats are limited by the plan instead (maxStaff, checked in beforeCreateInvitation).
      membershipLimit: 1_000_000,
      invitationExpiresIn: 60 * 60 * 24 * 7,
      cancelPendingInvitationsOnReInvite: true,
      requireEmailVerificationOnInvitation: true,
      // Better Auth already stops non-owners from granting the owner role.
      // These keep invitations and role changes to single team roles.
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation, inviter }) => {
          if (!invitableRoles.has(invitation.role)) throw new APIError("BAD_REQUEST", { message: "This role can't be invited." });
          // Staff seats and read-only access come from the agency's plan.
          const t = billingText(localeOf(inviter));
          const [{ access, limits }, usage] = await Promise.all([agencyBilling(invitation.organizationId), agencyUsage(invitation.organizationId)]);
          if (access.level === "read_only") throw new APIError("FORBIDDEN", { message: t("readOnly") });
          if (invitation.role !== "artist" && !withinLimit(limits, "maxStaff", usage.maxStaff)) throw seatsFull(limits.maxStaff ?? 0, localeOf(inviter));
        },
        afterAcceptInvitation: async ({ invitation, member, user, organization }) => {
          // Better Auth marks the invitation accepted before creating the member, so for a moment its
          // seat looks free to other changes; if one took it, this join is undone.
          if (takesStaffSeat(member.role) && !(await confirmJoinedSeat(organization.id, member.id, invitation.id))) {
            throw seatsFull((await agencyBilling(organization.id)).limits.maxStaff ?? 0, localeOf(user));
          }
          // An artist's account is linked to their profile by the agency; tell it someone is waiting.
          if (member.role !== "artist") return;
          if (await prisma.artist.findFirst({ where: { organizationId: organization.id, userId: user.id }, select: { id: true } })) return;
          await notify(await agencyDeskUserIds(organization.id, ["agency_owner", "agency_admin"]), { type: "artist_joined", data: { name: user.name }, url: "/app/artists" });
        },
        // The check above can't see an invitation or promotion made at the same moment, so
        // sendInvitationEmail re-counts under a lock once the invitation exists and cancels it
        // if the seats ran out (Better Auth ignores errors there); this reports that to the caller.
        afterCreateInvitation: async ({ invitation, inviter }) => {
          const current = await prisma.invitation.findUnique({ where: { id: invitation.id }, select: { status: true } });
          if (current?.status !== "canceled") return;
          const [{ limits }, usage] = await Promise.all([agencyBilling(invitation.organizationId), agencyUsage(invitation.organizationId)]);
          if (!withinLimit(limits, "maxStaff", usage.maxStaff)) throw seatsFull(limits.maxStaff ?? 0, localeOf(inviter));
          // Canceled although seats are free: the re-check itself failed (see sendInvitationEmail).
          throw new APIError("SERVICE_UNAVAILABLE", { message: "The invitation couldn't be checked. Try again.", code: "SEAT_CHECK_FAILED" });
        },
        // Better Auth has checked who may change roles by now. It writes the role after this
        // hook returns, so the check here only refuses early; afterUpdateMemberRole decides.
        // The hooks don't know who's asking: the team action translates the error by its code.
        beforeUpdateMemberRole: async ({ member, newRole, organization }) => {
          if (member.role === "customer" || !assignableRoles.has(newRole)) {
            throw new APIError("BAD_REQUEST", { message: "This role change isn't allowed." });
          }
          if (takesStaffSeat(newRole) && !takesStaffSeat(member.role)) {
            const [{ limits }, usage] = await Promise.all([agencyBilling(organization.id), agencyUsage(organization.id)]);
            if (!withinLimit(limits, "maxStaff", usage.maxStaff)) throw seatsFull(limits.maxStaff ?? 0, "en");
          }
        },
        // Re-counts under the agency's lock once the role is written and undoes it when the seats
        // are over (another change got in between), so the request fails with nothing changed.
        afterUpdateMemberRole: async ({ member, previousRole, organization }) => {
          let kept: boolean;
          try {
            kept = await confirmMemberSeat(organization.id, member.id, previousRole);
          } catch (error) {
            // Couldn't check: don't leave an unchecked seat behind a failed request.
            if (takesStaffSeat(member.role) && !takesStaffSeat(previousRole)) {
              await prisma.member.updateMany({ where: { id: member.id, role: member.role }, data: { role: previousRole } }).catch(() => undefined);
            }
            throw error;
          }
          if (!kept) throw seatsFull((await agencyBilling(organization.id)).limits.maxStaff ?? 0, "en");
        },
      },
      schema: {
        organization: {
          additionalFields: {
            kvkNumber: { type: "string", required: false },
            vatNumber: { type: "string", required: false },
            contactEmail: { type: "string", required: false },
            phone: { type: "string", required: false },
            website: { type: "string", required: false },
            addressLine: { type: "string", required: false },
            postalCode: { type: "string", required: false },
            city: { type: "string", required: false },
            brandColor: { type: "string", required: false },
          },
        },
      },
      sendInvitationEmail: async ({ id, role, email, organization, inviter }) => {
        // A new invitation over the seat limit (a race with another invitation or promotion) is
        // canceled, not sent. A resend finds its seat already checked (seatCheckedAt) and is sent again.
        let kept: boolean;
        try {
          kept = await confirmInvitationSeat(organization.id, id);
        } catch (error) {
          // Better Auth swallows errors from here, which would leave an unchecked invitation:
          // cancel it instead (fail closed); afterCreateInvitation then reports the failure.
          console.error("[team] seat check for invitation failed", id, error);
          await prisma.invitation.updateMany({ where: { id, status: "pending", seatCheckedAt: null }, data: { status: "canceled" } });
          return;
        }
        if (!kept) return;
        const locale = localeOf(inviter.user);
        deliver({
          kind: "invitation",
          to: email,
          params: {
            locale,
            agency: organization.name,
            inviter: inviter.user.name,
            role: roleLabels[locale][role] ?? role,
            url: appPath(locale, `/invite/${id}`),
          },
        });
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 3,
      disableSignUp: true,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp }) => {
        const user = await prisma.user.findUnique({ where: { email }, select: { locale: true } });
        // No account, no mail: a code for an unknown address could never be used,
        // and the sign-in form answers the same either way.
        if (!user) return;
        deliver({ kind: "loginCode", to: email, params: { locale: localeOf(user), code: otp } });
      },
    }),
    twoFactor({ issuer: "StageDesk" }),
    impersonation(),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
