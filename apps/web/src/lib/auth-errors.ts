import type { Messages } from "next-intl";

type AuthMessageKey =
  | `auth.${Exclude<keyof Messages["auth"], "signIn" | "signUp" | "forgot" | "reset" | "twoFactor">}`
  | `auth.signIn.${keyof Messages["auth"]["signIn"]}`
  | `auth.signUp.${keyof Messages["auth"]["signUp"]}`
  | `auth.reset.${keyof Messages["auth"]["reset"]}`
  | `auth.twoFactor.${keyof Messages["auth"]["twoFactor"]}`;

const byCode: Record<string, AuthMessageKey> = {
  INVALID_EMAIL_OR_PASSWORD: "auth.signIn.invalid",
  EMAIL_NOT_VERIFIED: "auth.signIn.unverified",
  USER_ALREADY_EXISTS: "auth.signUp.emailTaken",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "auth.signUp.emailTaken",
  INVALID_TOKEN: "auth.reset.invalidToken",
  INVALID_OTP: "auth.signIn.invalidCode",
  OTP_EXPIRED: "auth.signIn.invalidCode",
  TOO_MANY_ATTEMPTS: "auth.signIn.invalidCode",
  INVALID_CODE: "auth.twoFactor.invalid",
  INVALID_BACKUP_CODE: "auth.twoFactor.invalid",
};

/** Maps a Better Auth client error to a translation key. */
export function authErrorKey(error: { code?: string; status?: number } | null | undefined): AuthMessageKey {
  if (!error) return "auth.generic";
  if (error.status === 429) return "auth.tooMany";
  return (error.code && byCode[error.code]) || "auth.generic";
}
