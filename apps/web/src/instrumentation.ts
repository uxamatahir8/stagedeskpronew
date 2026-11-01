/**
 * Runs once when a server instance starts. In production it refuses to start
 * with an unsafe or incomplete configuration (see checkProductionConfig), so
 * a bad deploy fails its health check instead of serving with, say, no CAPTCHA
 * or a placeholder auth secret.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  // `next build` prerenders with NODE_ENV=production too; only a running server is checked.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkProductionConfig } = await import("@stagedesk/core");
  const { errors, warnings } = checkProductionConfig(process.env, "web");
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`Refusing to start: ${errors.length} configuration problem(s). See the [config] lines above.`);
  }
}
