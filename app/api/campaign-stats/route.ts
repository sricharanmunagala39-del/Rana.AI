export const runtime = "nodejs";

// Retired: an old route that reached Sarvam with RANA's own keys and no plan, role or ownership checks.
// Everything it did now goes through /api/sarvam/* (Talk page, Call me, campaigns), which checks all of them.
const gone = () => Response.json({ error: "This endpoint is retired." }, { status: 410 });
export const GET = gone;
export const POST = gone;
export const PATCH = gone;
export const PUT = gone;
export const DELETE = gone;
