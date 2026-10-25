/**
 * One password rule for every place a password is chosen (sign-up, reset,
 * change, partner application, account from a quote), checked in the browser
 * and again on the server.
 */
export const passwordRules = { min: 10, max: 128 } as const;

export type PasswordProblem = "short" | "long" | "letter" | "number";

/** The first rule a password breaks, or null when it's acceptable. */
export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < passwordRules.min) return "short";
  if (password.length > passwordRules.max) return "long";
  if (!/\p{L}/u.test(password)) return "letter";
  if (!/\d/.test(password)) return "number";
  return null;
}

/**
 * How strong a password looks, 0 (empty) to 4 (strong), with what would make it
 * stronger. Only advice: anything without a problem is allowed.
 */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; tips: ("length" | "case" | "number" | "symbol" | "repeat")[] } {
  if (!password) return { score: 0, tips: [] };
  const tips: ("length" | "case" | "number" | "symbol" | "repeat")[] = [];
  let points = 0;
  if (password.length >= passwordRules.min) points++;
  else tips.push("length");
  if (password.length >= 14) points++;
  else if (password.length >= passwordRules.min) tips.push("length");
  if (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)) points++;
  else tips.push("case");
  if (/\d/.test(password)) points++;
  else tips.push("number");
  if (/[^\p{L}\d]/u.test(password)) points++;
  else tips.push("symbol");
  // The same character over and over, or a well-known pattern, counts for little.
  if (/(.)\1{3,}/.test(password) || /^(?:password|wachtwoord|qwerty|123456|abcdef)/i.test(password)) {
    points = Math.min(points, 1);
    tips.push("repeat");
  }
  if (passwordProblem(password)) points = Math.min(points, 1);
  return { score: Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4, tips: [...new Set(tips)] };
}
