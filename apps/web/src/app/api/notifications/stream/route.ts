import { latestNotifications } from "@stagedesk/db";
import { auth } from "@/lib/auth";

const POLL_MS = 5_000;
const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events with the signed-in user's latest notifications. Sends a
 * snapshot on connect and again whenever something changes (checked every
 * few seconds with two indexed queries); comments keep proxies from closing it.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response(null, { status: 401 });
  const userId = session.user.id;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const push = async () => {
        try {
          const snapshot = await latestNotifications(userId);
          const signature = `${snapshot.unread}:${snapshot.items[0]?.id ?? ""}:${snapshot.items.filter((n) => n.readAt).length}`;
          if (signature === last) return;
          last = signature;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
        } catch (error) {
          console.error("[notifications] stream poll failed", error);
        }
      };
      await push();
      timer = setInterval(push, POLL_MS);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), HEARTBEAT_MS);
      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      });
    },
    cancel() {
      clearInterval(timer);
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
