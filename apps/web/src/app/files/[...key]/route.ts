import { getPublicFile } from "@/lib/storage";

// Only these folders in the public bucket are served.
const servedPrefixes = ["organizations/"];

export async function GET(_request: Request, { params }: RouteContext<"/files/[...key]">) {
  const key = (await params).key.join("/");
  if (!servedPrefixes.some((p) => key.startsWith(p)) || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const object = await getPublicFile(key);
    return new Response(object.Body?.transformToWebStream(), {
      headers: {
        "Content-Type": object.ContentType ?? "application/octet-stream",
        // Keys contain a random part and change on every upload, so they can be cached for good.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
