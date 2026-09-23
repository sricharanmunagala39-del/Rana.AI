export const runtime = "nodejs";

export async function POST() {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    const res = await fetch("https://api.cartesia.ai/access-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cartesia-Version": "2026-08-14",
        Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`,
      },
      // Short TTL — this token only needs to live long enough to open the WebSocket.
      body: JSON.stringify({ grants: { agent: true }, expires_in: 300 }),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data?.message || data?.error || "Failed to mint a Cartesia session token" },
        { status: res.status }
      );
    }
    return Response.json({ token: data.token });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to mint a Cartesia session token" }, { status: 500 });
  }
}
