export const runtime = "nodejs";

// Retired: this old route dialled lists with no plan, DNC, calling-window or tenant checks.
// Campaigns go through /api/campaigns, which enforces all of them.
export async function POST() {
  return Response.json({ error: "This endpoint is retired. Launch campaigns from Bulk Campaigns." }, { status: 410 });
}
