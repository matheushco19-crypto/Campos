-- Market Intelligence OS — MVP round 3 (NOT applied to production by this change).
-- Adds the columns the application now writes, plus the persistent job lock.
-- Idempotent: safe to run more than once.

-- 1. Verified facts: verification method, session normalization, release date, curve instrument.
alter table public.verified_facts
  add column if not exists verification_method text not null default 'unavailable'
    check (verification_method in ('independent_crosscheck','official_crosscheck','official_single','single_source','unofficial_vendor','proxy','derived','unavailable','conflict')),
  add column if not exists session jsonb,
  add column if not exists released_at timestamptz,
  add column if not exists instrument jsonb;

-- 2. Raw observations (audit trail) carry the same session / release / instrument metadata.
alter table public.raw_observations
  add column if not exists session jsonb,
  add column if not exists "releasedAt" timestamptz,
  add column if not exists instrument jsonb;

-- 3. Event clusters: deterministic relevance ranking.
alter table public.event_clusters
  add column if not exists relevance_score real not null default 0,
  add column if not exists relevance_components jsonb not null default '{}',
  add column if not exists hard_override boolean not null default false,
  add column if not exists hard_override_reason text,
  add column if not exists geography text not null default 'GLOBAL',
  add column if not exists domain text not null default 'other',
  add column if not exists metric_target text,
  add column if not exists market_signals jsonb not null default '[]',
  add column if not exists rank_bucket text not null default 'tail' check (rank_bucket in ('top','watchlist','tail'));
create index if not exists event_clusters_rank_idx on public.event_clusters (brief_date, rank_bucket, relevance_score desc);

-- 4. Snapshots: lede (written since round 2, missing from the init migration), curves,
--    watchlist, coverage matrix and the idempotency hash of the submitted analysis.
alter table public.intelligence_snapshots
  add column if not exists lede jsonb,
  add column if not exists rates jsonb,
  add column if not exists watchlist_candidates jsonb not null default '[]',
  add column if not exists coverage_matrix jsonb not null default '[]',
  add column if not exists analysis_hash text;

-- 5. Persistent job lock: one run per job and run key (e.g. MORNING_INTELLIGENCE:2026-10-01).
create table if not exists public.job_leases (
  lease_id text primary key,
  job_name text not null,
  run_key text not null,
  status text not null check (status in ('RUNNING','COMPLETED','FAILED')),
  owner text not null,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  result jsonb,
  unique (job_name, run_key)
);
create index if not exists job_leases_job_idx on public.job_leases (job_name, started_at desc);
alter table public.job_leases enable row level security;
