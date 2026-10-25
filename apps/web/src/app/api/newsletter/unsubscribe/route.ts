import { NextResponse } from "next/server";
import { unsubscribeNewsletter } from "@stagedesk/db";

/**
 * The List-Unsubscribe address in every newsletter. Mail apps POST here for
 * their one-click button (RFC 8058); a person who opens it in a browser is sent
 * to the page that asks to confirm.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (token) await unsubscribeNewsletter(token);
  return new NextResponse(null, { status: 204 });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const locale = url.searchParams.get("locale") === "en" ? "/en" : "";
  return NextResponse.redirect(new URL(`${locale}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, url.origin));
}
