// Promise Engine — the task lifecycle. Pure functions: no I/O, fully unit-tested.
//
// Rules this file enforces (from the product brief):
//  • A task is only "completed" with evidence from the system that did the work (message id, call id,
//    calendar event id, CRM id) or a named person's confirmation. The agent saying "I'll send it" is not evidence.
//  • A failed attempt records why. After maxAttempts failures the task goes to "needs_human" — it is never dropped.
//  • Terminal states (completed, cancelled) cannot be re-opened by automation, so retried webhooks can't undo work.

import type { DetectedPromise, Evidence, EvidenceType, PromiseEvent, PromiseStatus, PromiseTask } from "./types";

export const DEFAULT_MAX_ATTEMPTS = 3;

const NEXT: Record<PromiseStatus, PromiseStatus[]> = {
  created: ["pending", "in_progress", "cancelled", "needs_human"],
  pending: ["in_progress", "completed", "cancelled", "needs_human"],
  in_progress: ["completed", "failed", "cancelled", "needs_human"],
  failed: ["in_progress", "cancelled", "needs_human"],
  needs_human: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const EVIDENCE: EvidenceType[] = ["message_id", "call_id", "calendar_event_id", "crm_record_id", "human_confirmation"];

export class PromiseError extends Error {
  constructor(message: string) { super(message); this.name = "PromiseError"; }
}

export function canMove(from: PromiseStatus, to: PromiseStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}
export const isOpen = (s: PromiseStatus) => s !== "completed" && s !== "cancelled";

export function validateEvidence(e: Evidence | null | undefined): string | null {
  if (!e) return "Completion needs evidence.";
  if (!EVIDENCE.includes(e.type)) return `Unknown evidence type "${(e as any).type}".`;
  if (!String(e.ref || "").trim()) return "Evidence needs a reference (message id, call id, event id or record id).";
  if (e.type === "human_confirmation" && !String(e.by || "").trim()) return "A human confirmation must name who confirmed it.";
  return null;
}

/** New task from a detection. customer_first tasks start "pending" (waiting on the customer); others "created". */
export function newTask(p: DetectedPromise, ctx: { id: string; clientId: string; callId: string; customerPhone: string | null; customerName: string | null; now?: Date; maxAttempts?: number }): { task: PromiseTask; event: PromiseEvent } {
  const at = (ctx.now ?? new Date()).toISOString();
  const status: PromiseStatus = p.owed === "customer_first" ? "pending" : "created";
  const task: PromiseTask = {
    ...p,
    id: ctx.id,
    clientId: ctx.clientId,
    callId: ctx.callId,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    status,
    assignee: null,
    attempts: 0,
    maxAttempts: ctx.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    evidence: null,
    createdAt: at,
    updatedAt: at,
  };
  return { task, event: { taskId: ctx.id, from: null, to: status, actor: "detector", at, reason: `Detected from ${p.source.from}: ${p.source.quote}` } };
}

type MoveOpts = { actor: string; now?: Date; reason?: string; evidence?: Evidence; assignee?: string };

/** The one way a task changes status. Throws PromiseError on anything the rules don't allow. */
export function transition(task: PromiseTask, to: PromiseStatus, o: MoveOpts): { task: PromiseTask; event: PromiseEvent } {
  if (!o.actor?.trim()) throw new PromiseError("Every change must name an actor.");
  if (!canMove(task.status, to)) throw new PromiseError(`Cannot move a ${task.status} task to ${to}.`);
  if (to === "completed") {
    const bad = validateEvidence(o.evidence);
    if (bad) throw new PromiseError(bad);
  }
  if ((to === "failed" || to === "cancelled" || to === "needs_human") && !o.reason?.trim()) {
    throw new PromiseError(`Moving to ${to} needs a reason.`);
  }
  const at = (o.now ?? new Date()).toISOString();
  const next: PromiseTask = {
    ...task,
    status: to,
    updatedAt: at,
    assignee: o.assignee ?? task.assignee,
    evidence: to === "completed" ? { ...o.evidence!, at: o.evidence!.at ?? at } : task.evidence,
    lastError: to === "failed" ? o.reason! : task.lastError,
  };
  return { task: next, event: { taskId: task.id, from: task.status, to, actor: o.actor, at, reason: o.reason ?? null, evidence: to === "completed" ? next.evidence : null } };
}

/**
 * Record the result of one automated attempt (e.g. a WhatsApp send).
 * ok + evidence → completed. Failure → failed, or needs_human once attempts reach maxAttempts.
 */
export function recordAttempt(task: PromiseTask, r: { ok: boolean; evidence?: Evidence; error?: string; actor: string; now?: Date }): { task: PromiseTask; events: PromiseEvent[] } {
  const events: PromiseEvent[] = [];
  let t = task;
  if (t.status !== "in_progress") {
    const s = transition(t, "in_progress", { actor: r.actor, now: r.now });
    t = s.task; events.push(s.event);
  }
  t = { ...t, attempts: t.attempts + 1 };
  if (r.ok) {
    // A "success" without evidence is treated as a failure: we can't prove it happened.
    const bad = validateEvidence(r.evidence);
    if (!bad) {
      const s = transition(t, "completed", { actor: r.actor, now: r.now, evidence: r.evidence });
      return { task: s.task, events: [...events, s.event] };
    }
    r = { ...r, ok: false, error: `Reported success but ${bad.toLowerCase()}` };
  }
  const reason = String(r.error || "Attempt failed (no error given).").slice(0, 500);
  const to: PromiseStatus = t.attempts >= t.maxAttempts ? "needs_human" : "failed";
  const s = transition(t, to, { actor: r.actor, now: r.now, reason: to === "needs_human" ? `Gave up after ${t.attempts} attempts: ${reason}` : reason });
  return { task: { ...s.task, lastError: reason }, events: [...events, s.event] };
}

/** Open, owed by the business, and past its due time. customer_first tasks are never overdue until the customer writes. */
export function isOverdue(task: Pick<PromiseTask, "status" | "dueAt" | "owed">, now = new Date()): boolean {
  return isOpen(task.status) && task.owed === "business" && !!task.dueAt && Date.parse(task.dueAt) < now.getTime();
}

/** Plain-language status line for dashboards and alerts. Never says "done" without evidence. */
export function describe(task: PromiseTask, now = new Date()): string {
  if (task.status === "completed") return `Done — ${task.evidence?.type.replace(/_/g, " ")} ${task.evidence?.ref}`;
  if (task.status === "cancelled") return "Cancelled";
  if (task.status === "needs_human") return `Needs a person — ${task.lastError || "automation stopped"}`;
  if (task.owed === "customer_first" && task.status === "pending") return "Waiting for the customer to message first";
  if (isOverdue(task, now)) return `Overdue since ${task.dueAt}`;
  return task.dueAt ? `Open — due ${task.dueAt}` : "Open";
}
