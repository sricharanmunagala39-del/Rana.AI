-- Promise Engine: commitments made on calls, tracked until there is evidence they were kept.
-- Additive only: two new tables, no change to existing tables or data.
-- Rollback: drop table public.commitment_events; drop table public.commitments;

create table if not exists public.commitments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  call_id       uuid references public.calls(id) on delete set null,
  dedupe_key    text not null,
  kind          text not null check (kind in ('send_info','callback','connect_human','counselling','demo_class','site_visit','confirm_slot')),
  title         text not null,
  owed          text not null check (owed in ('business','customer_first')),
  channel       text check (channel in ('whatsapp','sms','email','call','in_person')),
  item          text,
  status        text not null default 'created' check (status in ('created','pending','in_progress','completed','failed','cancelled','needs_human')),
  confidence    text not null check (confidence in ('high','medium')),
  customer_phone text,
  customer_name  text,
  due_at        timestamptz,
  due_text      text,
  source        jsonb not null,             -- { from, turn, quote }: why this task exists
  assignee      text,
  attempts      integer not null default 0,
  max_attempts  integer not null default 3,
  last_error    text,
  evidence      jsonb,                      -- { type, ref, at, by, note }: required for status = completed
  shadow        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- "is not null" matters: with a NULL evidence the ? tests yield NULL, and a NULL check passes.
  constraint commitments_completed_has_evidence check (
    status <> 'completed'
    or (evidence is not null and evidence ? 'type' and coalesce(btrim(evidence->>'ref'), '') <> '')
  )
);

create unique index if not exists commitments_dedupe_key on public.commitments (dedupe_key);
create index if not exists commitments_open_due on public.commitments (client_id, due_at) where status not in ('completed','cancelled');
create index if not exists commitments_customer on public.commitments (client_id, customer_phone);
create index if not exists commitments_call on public.commitments (call_id);

create table if not exists public.commitment_events (
  id            bigint generated always as identity primary key,
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  actor         text not null,
  reason        text,
  evidence      jsonb,
  at            timestamptz not null default now()
);
create index if not exists commitment_events_commitment on public.commitment_events (commitment_id, at);

-- Same posture as every other table in this project: RLS on, no policies. Only the server (service key) reads/writes.
alter table public.commitments enable row level security;
alter table public.commitment_events enable row level security;
