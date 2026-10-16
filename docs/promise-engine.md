# Promise Engine (increment 1: detect + track, shadow mode)

**Why.** In the 433 calls with transcripts up to 14 Oct 2026, the agent promised to send something in about 185 and to call back in about 23 (regex count over the agent's own lines; an estimate, not a hand count). Nothing tracked any of them: follow-ups were only the `calls.follow_up` boolean.

**What this increment does.**
- `lib/promises/detect.ts` reads a finished call and lists its commitments: `send_info`, `callback`, `connect_human`, `counselling`, `demo_class`, `site_visit`, `confirm_slot`. One per kind per call, each with the quoted line it came from, who owes it (`business` or `customer_first` for "send 'Hi' and we'll send the location"), and a due time from the words spoken (`when.ts`: tomorrow / repu / kal / Monday / at 5 PM / this evening / end of the month), else a per-kind default.
- `lib/promises/lifecycle.ts` is the state machine. A task reaches `completed` only with evidence (`message_id`, `call_id`, `calendar_event_id`, `crm_record_id`, or a named `human_confirmation`). A reported success without evidence counts as a failure. After `maxAttempts` failures (default 3) the task goes to `needs_human`, never silently dropped. The database enforces the evidence rule too.
- `lib/promises/store.ts` writes tasks to `commitments` and `commitment_events`, idempotent on `dedupe_key` (client, call, kind). It is wired into the Sarvam webhook and the Cartesia sync after lead alerts, and it never throws.

**Switch.** `RANA_PROMISES` = unset/`off` (default, does nothing), `shadow` (record only, rows flagged `shadow = true`), `on` (record; notifications come in the next increment).

**Rollout.**
1. Apply `supabase/migrations/20261016120000_promise_engine.sql` (additive: two new tables). Rollback: `drop table public.commitment_events; drop table public.commitments;`
2. Run `npx tsx scripts/promises-dry-run.ts 30` with the Supabase env vars. It writes nothing and prints aggregate counts only.
3. Set `RANA_PROMISES=shadow` in Vercel. For a week, compare tasks against real calls, then tune the patterns.
4. Next increment: owner assignment, overdue alerts, WhatsApp send with the provider message id as evidence, and a Promises view in the dashboard.

**Tests.** `npm test` runs 28 tests, built on redacted lines from real calls.
