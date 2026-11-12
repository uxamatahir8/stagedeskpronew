import { connection } from "next/server";
import { localMailTransport } from "@stagedesk/emails";

/**
 * For the e2e global setup only (never in production): whether this server
 * sends mail to a local catcher and uses a database on this machine. Says
 * nothing about hosts or credentials.
 */
export async function GET() {
  await connection();
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  let databaseLocal = false;
  try {
    databaseLocal = ["localhost", "127.0.0.1", "::1", "mysql"].includes(new URL(process.env["DATABASE_URL"] ?? "").hostname);
  } catch {
    databaseLocal = false;
  }
  return Response.json({ mailLocal: localMailTransport(), databaseLocal }, { headers: { "Cache-Control": "no-store" } });
}
