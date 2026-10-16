// Dry run of the Promise Engine over calls already in Supabase. Writes NOTHING.
// Prints aggregate counts only (no phone numbers, names or transcript text), so the output is safe to share.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/promises-dry-run.ts [days=30]

import { sbAll } from "../lib/db";
import { plan } from "../lib/promises/store";
import { isOverdue } from "../lib/promises/lifecycle";

async function main() {
  const days = Number(process.argv[2] || 30);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const clients = await sbAll<any>(`/clients?select=id,industry&order=id`);
  const industry = new Map(clients.map((c) => [c.id, c.industry]));
  const calls = await sbAll<any>(`/calls?select=id,client_id,caller_phone,caller_name,summary,transcript,started_at,ended_at,duration_seconds,handoff,source&created_at=gte.${since}&order=created_at`);

  const byKind: Record<string, { total: number; business: number; customer_first: number; high: number; overdue_now: number }> = {};
  let withPromise = 0;
  for (const call of calls) {
    if (call.source === "manual") continue;
    const tasks = plan(call, industry.get(call.client_id)).map((p) => p.task);
    if (tasks.length) withPromise++;
    for (const t of tasks) {
      const k = (byKind[t.kind] ||= { total: 0, business: 0, customer_first: 0, high: 0, overdue_now: 0 });
      k.total++;
      k[t.owed]++;
      if (t.confidence === "high") k.high++;
      if (isOverdue(t)) k.overdue_now++; // nothing is ever completed today, so every business-owed task past due is overdue
    }
  }
  console.log(JSON.stringify({ window_days: days, calls: calls.length, calls_with_a_promise: withPromise, by_kind: byKind }, null, 2));
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
