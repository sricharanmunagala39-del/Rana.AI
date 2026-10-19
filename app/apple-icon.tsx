import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/lib/brandMark";

// iPhone / iPad home-screen icon: RANA AI mark on white.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brandMarkDataUri()} width={150} height={150} alt="" />
      </div>
    ),
    size,
  );
}
