import { readFileSync } from "fs";
import { join } from "path";

/** Server-only: the RANA AI mark as a PNG data URI (for next/og ImageResponse: OG card, apple icon). */
export function brandMarkDataUri(): string {
  const svg = readFileSync(join(process.cwd(), "public/brand/rana-mark.svg"), "utf8");
  const b64 = svg.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] || "";
  return `data:image/png;base64,${b64}`;
}
