// Promise Engine — persistence (Supabase via PostgREST, same service-key helper as the rest of lib/).
//
// Switched by RANA_PROMISES:
//   unset / "off" → does nothing (default; safe to deploy before the migration is applied)
//   "shadow"      → records tasks only. Nobody is notified; HQ can compare tasks against real calls.
//   "on"          → records tasks (notification and auto-execution arrive in a later increment).
//
// Idempotent: each (client, call, kind) has one dedupe_key with a unique index, so a retried webhook or a
// re-sync inserts nothing new. Never throws — a Promise Engine problem must never fail a call webhook.

import { randomUUID } from "crypto";
import { sb } from "../db";
import { checkPhone } from "../leadImport";
import { detectPromises, industryOf } from "./detect";
import { newTask } from "./lifecycle";
import type { CallForPromises, PromiseEvent, PromiseTask } from "./types";

export type PromiseMode = "off" | "shadow" | "on";
export function promiseMode(): PromiseMode {
  const v = String(process.env.RANA_PROMISES || "off").toLowerCase();
  return v === "shadow" || v === "on" ? v : "off";
}

/** Columns of public.commitments (supabase/migrations/20261016120000_promise_engine.sql). */
export function toRow(t: PromiseTask, mode: PromiseMode) {
  return {
    id: t.id,
    client_id: t.clientId,
    call_id: t.callId,
    dedupe_key: t.dedupeKey,
    kind: t.kind,
    title: t.title,
    owed: t.owed,
    channel: t.channel,
    item: t.item,
    status: t.status,
    confidence: t.confidence,
    customer_phone: t.customerPhone,
    customer_name: t.customerName,
    due_at: t.dueAt,
    due_text: t.dueText,
    source: t.source,
    assignee: t.assignee,
    attempts: t.attempts,
    max_attempts: t.maxAttempts,
    last_error: t.lastError,
    evidence: t.evidence,
    shadow: mode === "shadow",
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}
export function eventRow(e: PromiseEvent, clientId: string) {
  return { commitment_id: e.taskId, client_id: clientId, from_status: e.from, to_status: e.to, actor: e.actor, reason: e.reason ?? null, evidence: e.evidence ?? null, at: e.at };
}

/** Build (but don't save) the tasks for a call. Exported so tests and backfills share one code path. */
export function plan(call: CallForPromises, clientIndustry: string | null | undefined, now = new Date()) {
  const phone = call.caller_phone ? checkPhone(call.caller_phone).e164 : null;
  return detectPromises(call, { industry: industryOf(clientIndustry), now }).map((p) =>
    newTask(p, { id: randomUUID(), clientId: call.client_id, callId: call.id, customerPhone: phone, customerName: call.caller_name || null, now }),
  );
}

/** After a call is saved. Returns how many NEW tasks were stored (0 when off, duplicate, or on error). */
export async function recordPromisesForCall(client: { id: string; industry?: string | null }, call: any): Promise<number> {
  const mode = promiseMode();
  if (mode === "off" || !call?.id || call.source === "manual" || client?.id !== call.client_id) return 0;
  try {
    const planned = plan(call as CallForPromises, client.industry);
    if (!planned.length) return 0;
    const inserted = (await sb<any[]>(`/commitments?on_conflict=dedupe_key`, {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: JSON.stringify(planned.map(({ task }) => toRow(task, mode))),
    })) || [];
    if (!inserted.length) return 0;
    const ids = new Set(inserted.map((r) => r.id));
    const events = planned.filter(({ task }) => ids.has(task.id)).map(({ event }) => eventRow(event, client.id));
    if (events.length) await sb(`/commitment_events`, { method: "POST", prefer: "return=minimal", body: JSON.stringify(events) }).catch((e) => console.error("[promises] events", e?.message));
    return inserted.length;
  } catch (e: any) {
    console.error("[promises] record failed", e?.message);
    return 0;
  }
}
