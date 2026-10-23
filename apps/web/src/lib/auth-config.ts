// Auth configuration. Import `auth` from "./auth" in app code; this file has no
// server-only guard so the Better Auth CLI can load it to generate the schema.
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization, twoFactor } from "better-auth/plugins";
import { createTranslator } from "next-intl";
import { withinLimit } from "@stagedesk/core";
import { agencyBilling, agencyUsage, prisma } from "@stagedesk/db";
import type { EmailLocale } from "@stagedesk/emails";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { ac, organizationRoles } from "./auth-roles";
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
  return user && "locale" in user && user.locale === "en" ? "en" : "nl";
}

/** Locale-aware app URL: Dutch has no prefix, English lives under /en. */
function appPath(locale: EmailLocale, path: string) {
  return `${appUrl}${locale === "en" ? "/en" : ""}${path}`;
}

export const auth = betterAuth({
  appName: "StageDesk",
  baseURL: appUrl,
  database: prismaAdapter(prisma, { provider: "mysql" }),

  user: {
    additionalFields: {
      // Set by seed/admin tools only; never accepted from a form.
      platformRole: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, defaultValue: "nl", input: true },
      phone: { type: "string", required: false, input: true },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      deliver({ kind: "resetPassword", to: user.email, params: { locale: localeOf(user), name: user.name, url } });
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
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 3 },
      "/email-otp/send-verification-otp": { window: 300, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
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
      invitationExpiresIn: 60 * 60 * 24 * 7,
      cancelPendingInvitationsOnReInvite: true,
      requireEmailVerificationOnInvitation: true,
      // Better Auth already stops non-owners from granting the owner role.
      // These keep invitations and role changes to single team roles.
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation, inviter }) => {
          if (!invitableRoles.has(invitation.role)) throw new APIError("BAD_REQUEST", { message: "This role can't be invited." });
          // Staff seats and read-only access come from the agency's plan.
          const t = createTranslator({ locale: localeOf(inviter), messages: localeOf(inviter) === "en" ? en : nl, namespace: "billing" });
          const [{ access, limits }, usage] = await Promise.all([agencyBilling(invitation.organizationId), agencyUsage(invitation.organizationId)]);
          if (access.level === "read_only") throw new APIError("FORBIDDEN", { message: t("readOnly") });
          if (invitation.role !== "artist" && !withinLimit(limits, "maxStaff", usage.maxStaff)) {
            throw new APIError("FORBIDDEN", { message: t("limitReached", { max: String(limits.maxStaff), limit: t("limit_maxStaff") }) });
          }
        },
        beforeUpdateMemberRole: async ({ member, newRole }) => {
          if (member.role === "customer" || !assignableRoles.has(newRole)) {
            throw new APIError("BAD_REQUEST", { message: "This role change isn't allowed." });
          }
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
        deliver({ kind: "loginCode", to: email, params: { locale: localeOf(user), code: otp } });
      },
    }),
    twoFactor({ issuer: "StageDesk" }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
