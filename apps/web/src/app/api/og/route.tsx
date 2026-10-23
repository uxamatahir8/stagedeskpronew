import { ImageResponse } from "next/og";

/**
 * Social preview image (1200×630) for public pages: the page title on the
 * StageDesk purple, with an optional small label above it.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = (params.get("title") ?? "StageDesk").slice(0, 120);
  const kicker = (params.get("kicker") ?? "").slice(0, 60);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #2e1546 0%, #4a2272 55%, #6b3aa0 100%)",
          color: "#faf7ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#faf7ff", color: "#4a2272", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>S</div>
          StageDesk
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {kicker && <div style={{ fontSize: 28, letterSpacing: 2, textTransform: "uppercase", color: "#d9c6f5" }}>{kicker}</div>}
          <div style={{ fontSize: title.length > 60 ? 56 : 68, fontWeight: 700, lineHeight: 1.08, maxWidth: 1000 }}>{title}</div>
        </div>
        <div style={{ fontSize: 26, color: "#d9c6f5" }}>stagedesk.pro</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
