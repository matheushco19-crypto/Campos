-- Market Intelligence OS — initial schema.
-- Independent project: it shares no objects with any other application.
-- Timestamps are stored in UTC (timestamptz). The UI converts them to America/Sao_Paulo.
-- RLS is enabled on every table with NO policies, so only the service role
-- (server side) can read or write. The anon key sees nothing.

create schema if not exists public;

-- 1. Verified facts: single source of truth for agents 2 and 3.
create table if not exists public.verified_facts (
  id text primary key,
  category text not null check (category in ('MARKET','MACRO','NEWS','CALENDAR','RESEARCH')),
  metric text not null,
  label text not null,
  region text not null,
  value double precision,
  unit text not null,
  reference_period text,
  as_of timestamptz,
  retrieved_at timestamptz not null,
  primary_source text,
  secondary_source text,
  primary_url text,
  secondary_url text,
  verification_status text not null check (verification_status in ('UNVERIFIED','VERIFIED','CONFLICT','REJECTED','UNAVAILABLE')),
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW','NONE')),
  notes text,
  change_pct double precision,
  previous_value double precision,
  market_status text not null default 'UNKNOWN',
  timezone text not null default 'UTC',
  source_fallback boolean not null default false,
  single_source boolean not null default false,
  is_stale boolean not null default false,
  brief_date date not null,
  run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verified_facts_brief_date_idx on public.verified_facts (brief_date);
create index if not exists verified_facts_metric_date_idx on public.verified_facts (metric, brief_date desc);

-- 2. Raw observations: audit trail of what each collector returned.
create table if not exists public.raw_observations (
  id text primary key,
  run_id text not null,
  brief_date date not null,
  "sourceId" text not null,
  category text not null,
  metric text not null,
  value double precision not null,
  unit text not null,
  "referencePeriod" text not null,
  "asOf" timestamptz not null,
  "retrievedAt" timestamptz not null,
  url text not null,
  "previousValue" double precision,
  "changePct" double precision,
  "marketStatus" text,
  notes text
);
create index if not exists raw_observations_brief_date_idx on public.raw_observations (brief_date);

-- 3. News and event clusters (deduplicated events).
create table if not exists public.news_items (
  id text primary key,
  headline text not null,
  original_summary text not null default '',
  published_at timestamptz not null,
  retrieved_at timestamptz not null,
  source text not null,
  source_id text not null,
  url text not null,
  topic text not null,
  region text not null,
  importance real not null,
  market_relevance real not null,
  uhnw_relevance real not null,
  social_relevance real not null,
  verification_status text not null,
  event_cluster_id text,
  brief_date date not null
);
create index if not exists news_items_brief_date_idx on public.news_items (brief_date);
create index if not exists news_items_cluster_idx on public.news_items (event_cluster_id);

create table if not exists public.event_clusters (
  id text primary key,
  title text not null,
  topic text not null,
  region text not null,
  first_published_at timestamptz not null,
  last_published_at timestamptz not null,
  item_ids jsonb not null default '[]',
  sources jsonb not null default '[]',
  importance real not null,
  market_relevance real not null,
  uhnw_relevance real not null,
  social_relevance real not null,
  verification_status text not null,
  brief_date date not null
);
create index if not exists event_clusters_brief_date_idx on public.event_clusters (brief_date);

-- 4. Event engine / editorial calendar.
create table if not exists public.calendar_events (
  id text primary key,
  name text not null,
  category text not null check (category in ('MACRO','MARKET','POLICY','TAX','REGULATION','TECH','CORPORATE','GEOPOLITICS','HOLIDAY','SOCIAL')),
  region text not null,
  date date not null,
  time text,
  timezone text not null,
  source text not null,
  source_url text,
  importance text not null,
  market_relevance text not null,
  audience_relevance text not null,
  content_opportunity text,
  verification_status text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_date_idx on public.calendar_events (date);

-- 5. Research broker.
create table if not exists public.research_requests (
  id text primary key,
  requested_by text not null,
  question text not null,
  metric text,
  priority text not null,
  deadline timestamptz,
  required_sources jsonb not null default '[]',
  status text not null check (status in ('PENDING','IN_PROGRESS','COMPLETED','FAILED','CONFLICT')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists research_requests_status_idx on public.research_requests (status);

-- 6. Observability.
create table if not exists public.agent_runs (
  run_id text primary key,
  parent_run_id text,
  agent text not null,
  job text,
  brief_date date,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  items_collected integer not null default 0,
  items_verified integer not null default 0,
  items_rejected integer not null default 0,
  errors jsonb not null default '[]',
  sources jsonb not null default '[]',
  execution_metadata jsonb not null default '{}'
);
create index if not exists agent_runs_started_idx on public.agent_runs (started_at desc);
create index if not exists agent_runs_brief_date_idx on public.agent_runs (brief_date);

-- 7. Intelligence snapshots — append-only history (one row per brief version).
create table if not exists public.intelligence_snapshots (
  id text primary key,
  date date not null,
  version integer not null,
  generated_at timestamptz not null,
  run_id text not null,
  status text not null,
  analysis_mode text not null,
  market_snapshot jsonb not null,
  macro_snapshot jsonb not null,
  news_snapshot jsonb not null,
  what_matters jsonb not null,
  macro_watch jsonb not null,
  insights jsonb not null,
  uhnw_lens jsonb not null,
  content_lab jsonb,
  agenda jsonb not null,
  source_references jsonb not null,
  content_opportunities jsonb not null default '[]',
  qc jsonb not null,
  limitations jsonb not null default '[]',
  unique (date, version)
);
create index if not exists intelligence_snapshots_date_idx on public.intelligence_snapshots (date desc, version desc);

-- History must never be overwritten: block UPDATE and DELETE on snapshots.
create or replace function public.mi_block_snapshot_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'intelligence_snapshots is append-only';
end;
$$;
drop trigger if exists intelligence_snapshots_append_only on public.intelligence_snapshots;
create trigger intelligence_snapshots_append_only
  before update or delete on public.intelligence_snapshots
  for each row execute function public.mi_block_snapshot_mutation();

-- 8. Analysis hand-off packets (Claude Code routine mode).
create table if not exists public.analysis_packets (
  id text primary key,
  date date not null,
  run_id text not null,
  created_at timestamptz not null,
  status text not null check (status in ('PENDING','SUBMITTED','EXPIRED')),
  packet jsonb not null,
  submitted_at timestamptz
);
create index if not exists analysis_packets_status_idx on public.analysis_packets (status);

-- 9. Social analytics & strategy.
create table if not exists public.social_posts (
  post_id text primary key,
  published_at timestamptz not null,
  format text not null,
  content_type text not null default 'other',
  topic text not null default 'other',
  caption text not null default '',
  reach double precision not null default 0,
  impressions double precision not null default 0,
  views double precision not null default 0,
  watch_time_s double precision not null default 0,
  avg_watch_time_s double precision not null default 0,
  completion_rate double precision,
  likes double precision not null default 0,
  comments double precision not null default 0,
  shares double precision not null default 0,
  saves double precision not null default 0,
  profile_visits double precision not null default 0,
  follows double precision not null default 0,
  link_clicks double precision not null default 0
);

create table if not exists public.content_opportunities (
  id text primary key,
  event_id text,
  cluster_id text,
  title text not null,
  angle text not null,
  format text not null,
  target_date date not null,
  priority text not null,
  status text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists content_opportunities_date_idx on public.content_opportunities (target_date);

create table if not exists public.strategy_reports (
  id text primary key,
  week_start date not null,
  generated_at timestamptz not null,
  mode text not null,
  report jsonb not null
);

-- RLS: locked down. Only the service role (bypasses RLS) can access.
alter table public.verified_facts enable row level security;
alter table public.raw_observations enable row level security;
alter table public.news_items enable row level security;
alter table public.event_clusters enable row level security;
alter table public.calendar_events enable row level security;
alter table public.research_requests enable row level security;
alter table public.agent_runs enable row level security;
alter table public.intelligence_snapshots enable row level security;
alter table public.analysis_packets enable row level security;
alter table public.social_posts enable row level security;
alter table public.content_opportunities enable row level security;
alter table public.strategy_reports enable row level security;
