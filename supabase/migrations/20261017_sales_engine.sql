-- RANA Sales Engine (HQ → Sales Engine). Additive only: new se_* tables, nothing existing is changed.
-- Server code uses the service key; RLS is on with no policies, so browsers can never read these tables.

create table if not exists public.se_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null,
  config_hash text not null,
  status text not null default 'running' check (status in ('running','paused','cancelled','completed','failed')),
  phase text not null default 'discover' check (phase in ('discover','research','score','call','follow_up','done')),
  mode text not null default 'simulation' check (mode in ('simulation','live')),
  sources_done text[] not null default '{}',
  source_tries jsonb not null default '{}',
  next_run_at timestamptz,
  log jsonb not null default '[]',
  lock_until timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
-- One open campaign per identical configuration (stops double launches).
create unique index if not exists se_campaigns_open_hash on public.se_campaigns (config_hash) where status in ('running','paused');
create index if not exists se_campaigns_status on public.se_campaigns (status, next_run_at);

create table if not exists public.se_prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.se_campaigns(id) on delete cascade,
  key text not null,
  status text not null,
  next_action_at timestamptz,
  score smallint,
  phone text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, key)
);
create index if not exists se_prospects_campaign_status on public.se_prospects (campaign_id, status);
create index if not exists se_prospects_key on public.se_prospects (key);
create index if not exists se_prospects_phone on public.se_prospects (phone);

create table if not exists public.se_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.se_campaigns(id) on delete cascade,
  prospect_id uuid references public.se_prospects(id) on delete cascade,
  kind text not null check (kind in ('call','booking','booking_failed','crm','suppressed','error','status')),
  data jsonb,
  at timestamptz not null default now()
);
create index if not exists se_events_campaign on public.se_events (campaign_id, at);

create table if not exists public.se_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  config jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.se_bookings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.se_campaigns(id) on delete set null,
  prospect_id uuid references public.se_prospects(id) on delete set null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  timezone text not null,
  company text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now()
);
-- The real double-booking guard: one confirmed demo per slot, one confirmed demo per prospect.
create unique index if not exists se_bookings_slot on public.se_bookings (slot_start) where status = 'confirmed';
create unique index if not exists se_bookings_prospect on public.se_bookings (prospect_id) where status = 'confirmed';

create table if not exists public.se_suppressions (
  id uuid primary key default gen_random_uuid(),
  phone text,
  email text,
  domain text,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index if not exists se_suppressions_phone on public.se_suppressions (phone);
create index if not exists se_suppressions_email on public.se_suppressions (email);
create index if not exists se_suppressions_domain on public.se_suppressions (domain);

alter table public.se_campaigns enable row level security;
alter table public.se_prospects enable row level security;
alter table public.se_events enable row level security;
alter table public.se_presets enable row level security;
alter table public.se_bookings enable row level security;
alter table public.se_suppressions enable row level security;
