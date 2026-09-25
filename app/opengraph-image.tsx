import { ImageResponse } from "next/og";

// Social share card (WhatsApp, LinkedIn, X, Slack) for every page that doesn't set its own.
export const alt = "RANA AI — AI voice agents for Indian businesses, in 11 Indian languages";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "72px 80px", color: "#ECEEF3", fontFamily: "sans-serif",
          backgroundColor: "#090C13",
          backgroundImage: "radial-gradient(circle at 12% 0%, rgba(45,225,194,0.28), rgba(9,12,19,0) 45%), radial-gradient(circle at 100% 100%, rgba(146,132,255,0.28), rgba(9,12,19,0) 45%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#2DE1C2,#9284FF)" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "#090C13", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, border: "5px solid #2DE1C2" }} />
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>RANA AI</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#2DE1C2", letterSpacing: 2, textTransform: "uppercase" }}>AI voice agents for Indian businesses</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, marginTop: 18 }}>Every call answered.</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: "#9284FF" }}>Every lead qualified.</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#8E96A7", gap: 36 }}>
          <span>11 Indian languages</span><span>Inbound + outbound</span><span>14-day free trial</span><span style={{ color: "#ECEEF3" }}>ranaai.in</span>
        </div>
      </div>
    ),
    size,
  );
}
