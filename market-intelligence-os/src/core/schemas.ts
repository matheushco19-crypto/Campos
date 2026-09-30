import { z } from 'zod'

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export const VerificationStatus = z.enum(['UNVERIFIED', 'VERIFIED', 'CONFLICT', 'REJECTED', 'UNAVAILABLE'])
export type VerificationStatus = z.infer<typeof VerificationStatus>

export const Confidence = z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE'])
export type Confidence = z.infer<typeof Confidence>

export const FactCategory = z.enum(['MARKET', 'MACRO', 'NEWS', 'CALENDAR', 'RESEARCH'])
export type FactCategory = z.infer<typeof FactCategory>

export const MarketStatus = z.enum(['OPEN', 'CLOSED', 'PRE_MARKET', 'UNKNOWN'])
export type MarketStatus = z.infer<typeof MarketStatus>

/**
 * HOW a fact was verified (docs/verification.md). Never "independent" when the
 * two sources share the same underlying feed.
 *  - independent_crosscheck: two sources with different lineage agree on the same reference date
 *  - official_crosscheck: two sources of the same official infrastructure agree (e.g. BRAPI + B3, Treasury + FRED/H.15)
 *  - official_single: the official source alone (the authority of the number)
 *  - single_source: one non-official source (vendor/exchange); never VERIFIED
 *  - unofficial_vendor: undocumented vendor endpoint (e.g. Yahoo); never counts toward VERIFIED
 *  - proxy: an approximation of the named instrument (e.g. DXY from ECB rates); never VERIFIED
 *  - derived: deterministic calculation from verified inputs (e.g. 2s10s spread)
 *  - unavailable / conflict
 */
export const VerificationMethod = z.enum(['independent_crosscheck', 'official_crosscheck', 'official_single', 'single_source', 'unofficial_vendor', 'proxy', 'derived', 'unavailable', 'conflict'])
export type VerificationMethod = z.infer<typeof VerificationMethod>

/**
 * Session semantics of an observation. A morning run must never present an
 * intraday print as a close.
 */
export const SessionInfo = z.object({
  /** Instant the value was observed/published by the source (UTC ISO). */
  observed_at: z.string(),
  /** Calendar date (in the market's timezone) the value refers to. */
  reference_date: z.string(),
  session: z.enum(['regular_close', 'intraday', 'fixing', 'continuous', 'settlement', 'official_close', 'release']),
  timezone: z.string(),
  source: z.string(),
  is_close: z.boolean(),
  is_intraday: z.boolean(),
  /** Trading session (date) the value belongs to. */
  session_of: z.string(),
  /** Human-readable rule used (docs/sessions.md). */
  rule: z.string().optional(),
})
export type SessionInfo = z.infer<typeof SessionInfo>

/** Exchange-traded contract behind a curve vertex (e.g. DI1F27 for the 12M bucket). */
export const Instrument = z.object({
  code: z.string(),
  maturity: z.string(),
  calendar_days: z.number().int(),
  business_days: z.number().int(),
  bucket: z.string().nullable().default(null),
})
export type Instrument = z.infer<typeof Instrument>

export const SourceKind = z.enum(['market', 'macro', 'news', 'calendar'])
export const SourceAuthority = z.enum(['official', 'exchange', 'data_vendor', 'unofficial_vendor', 'press', 'manual'])
export const AccessMethod = z.enum(['api', 'rss', 'csv', 'ics', 'manual', 'not_integrated'])

export const EventCategory = z.enum([
  'MACRO',
  'MARKET',
  'POLICY',
  'TAX',
  'REGULATION',
  'TECH',
  'CORPORATE',
  'GEOPOLITICS',
  'HOLIDAY',
  'SOCIAL',
])
export type EventCategory = z.infer<typeof EventCategory>

export const Region = z.enum(['BR', 'US', 'EU', 'CN', 'ASIA', 'GLOBAL'])
export type Region = z.infer<typeof Region>

export const AgentName = z.enum([
  'market-intelligence',
  'financial-intelligence',
  'social-strategist',
  'orchestrator',
  'verification-engine',
  'research-broker',
])
export type AgentName = z.infer<typeof AgentName>

export const RunStatus = z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'AWAITING_ANALYSIS', 'SKIPPED'])
export type RunStatus = z.infer<typeof RunStatus>

export const JobName = z.enum(['MORNING_INTELLIGENCE', 'MARKET_CLOSE_REFRESH', 'WEEKLY_SOCIAL_STRATEGY', 'ON_DEMAND_RESEARCH'])
export type JobName = z.infer<typeof JobName>

export const ResearchStatus = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CONFLICT'])
export type ResearchStatus = z.infer<typeof ResearchStatus>

export const Level = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export type Level = z.infer<typeof Level>

/* ------------------------------------------------------------------ */
/* Source registry                                                     */
/* ------------------------------------------------------------------ */

export const SourceDefinition = z.object({
  id: z.string(),
  /**
   * Data lineage: sources sharing the same underlying feed have the same lineage
   * (e.g. brapi and B3 → "b3"; us-treasury and FRED DGS* → "us-treasury").
   * Two agreeing sources only count as independent when their lineages differ.
   */
  lineage: z.string().optional(),
  name: z.string(),
  kind: SourceKind,
  authority: SourceAuthority,
  /** Lower number = higher priority inside its kind. */
  priority: z.number().int(),
  homepage: z.string().url(),
  access: AccessMethod,
  enabled: z.boolean(),
  /** Env var holding a credential, when the source needs one. Never the value. */
  credentialEnv: z.string().optional(),
  /** Known limitation, ToS restriction or reason for not integrating. */
  limitation: z.string().optional(),
  regions: z.array(Region).default([]),
})
export type SourceDefinition = z.infer<typeof SourceDefinition>

/* ------------------------------------------------------------------ */
/* Raw observations (output of deterministic collectors)               */
/* ------------------------------------------------------------------ */

export const RawObservation = z.object({
  sourceId: z.string(),
  category: z.enum(['MARKET', 'MACRO']),
  /** Internal metric key, e.g. "SPX", "BR_SELIC_TARGET". */
  metric: z.string(),
  value: z.number().finite(),
  unit: z.string(),
  /** Period the number refers to: "2026-09-28" (daily) or "2026-08" (monthly). */
  referencePeriod: z.string(),
  /** Instant the value is valid for (UTC ISO). */
  asOf: z.string(),
  retrievedAt: z.string(),
  url: z.string().url(),
  previousValue: z.number().finite().nullable().optional(),
  changePct: z.number().finite().nullable().optional(),
  marketStatus: MarketStatus.optional(),
  notes: z.string().optional(),
  session: SessionInfo.optional(),
  /** Publication date of the value (e.g. IBGE release date from SIDRA /periodos). */
  releasedAt: z.string().optional(),
  instrument: Instrument.optional(),
})
export type RawObservation = z.infer<typeof RawObservation>

/* ------------------------------------------------------------------ */
/* Verified facts: the single source of truth for agents 2 and 3       */
/* ------------------------------------------------------------------ */

export const VerifiedFact = z.object({
  id: z.string(),
  category: FactCategory,
  metric: z.string(),
  label: z.string(),
  region: Region,
  value: z.number().nullable(),
  unit: z.string(),
  reference_period: z.string().nullable(),
  as_of: z.string().nullable(),
  retrieved_at: z.string(),
  primary_source: z.string().nullable(),
  secondary_source: z.string().nullable(),
  primary_url: z.string().nullable(),
  secondary_url: z.string().nullable(),
  verification_status: VerificationStatus,
  confidence: Confidence,
  notes: z.string().nullable(),
  /** Extra market fields. */
  change_pct: z.number().nullable().default(null),
  previous_value: z.number().nullable().default(null),
  market_status: MarketStatus.default('UNKNOWN'),
  timezone: z.string().default('UTC'),
  source_fallback: z.boolean().default(false),
  single_source: z.boolean().default(false),
  is_stale: z.boolean().default(false),
  verification_method: VerificationMethod.default('unavailable'),
  session: SessionInfo.nullable().default(null),
  /** Release/publication date of the number, when the source provides it (e.g. IBGE release). */
  released_at: z.string().nullable().default(null),
  instrument: Instrument.nullable().default(null),
  /** Snapshot date (America/Sao_Paulo) the fact was collected for. */
  brief_date: z.string(),
  run_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type VerifiedFact = z.infer<typeof VerifiedFact>

/* ------------------------------------------------------------------ */
/* News & event clusters                                               */
/* ------------------------------------------------------------------ */

export const NewsTopic = z.enum([
  'markets',
  'economy',
  'monetary_policy',
  'fiscal',
  'tax',
  'regulation',
  'politics',
  'banking_credit',
  'capital_markets',
  'corporate',
  'm_and_a',
  'technology',
  'ai',
  'geopolitics',
  'commodities',
  'international',
  'wealth',
  'other',
])
export type NewsTopic = z.infer<typeof NewsTopic>

export const NewsItem = z.object({
  id: z.string(),
  headline: z.string(),
  original_summary: z.string(),
  published_at: z.string(),
  retrieved_at: z.string(),
  source: z.string(),
  source_id: z.string(),
  url: z.string().url(),
  topic: NewsTopic,
  region: Region,
  importance: z.number().min(0).max(100),
  market_relevance: z.number().min(0).max(100),
  uhnw_relevance: z.number().min(0).max(100),
  social_relevance: z.number().min(0).max(100),
  verification_status: VerificationStatus,
  event_cluster_id: z.string().nullable(),
  brief_date: z.string(),
})
export type NewsItem = z.infer<typeof NewsItem>

export const EventCluster = z.object({
  id: z.string(),
  title: z.string(),
  topic: NewsTopic,
  region: Region,
  first_published_at: z.string(),
  last_published_at: z.string(),
  item_ids: z.array(z.string()),
  sources: z.array(z.object({ source: z.string(), url: z.string(), headline: z.string() })),
  importance: z.number(),
  market_relevance: z.number(),
  uhnw_relevance: z.number(),
  social_relevance: z.number(),
  verification_status: VerificationStatus,
  brief_date: z.string(),
  /** Deterministic salience (engines/relevance.ts). */
  relevance_score: z.number().min(0).max(100).default(0),
  relevance_components: z.record(z.string(), z.number()).default({}),
  hard_override: z.boolean().default(false),
  hard_override_reason: z.string().nullable().default(null),
  geography: z.string().default('GLOBAL'),
  domain: z.string().default('other'),
  /** Named metric the event refers to (engines/metric-alignment.ts). */
  metric_target: z.string().nullable().default(null),
  market_signals: z.array(z.string()).default([]),
  rank_bucket: z.enum(['top', 'watchlist', 'tail']).default('tail'),
})
export type EventCluster = z.infer<typeof EventCluster>

/* ------------------------------------------------------------------ */
/* Event engine (calendar)                                             */
/* ------------------------------------------------------------------ */

export const CalendarEvent = z.object({
  id: z.string(),
  name: z.string(),
  category: EventCategory,
  region: Region,
  date: z.string(),
  time: z.string().nullable(),
  timezone: z.string(),
  source: z.string(),
  source_url: z.string().nullable(),
  importance: Level,
  market_relevance: Level,
  audience_relevance: Level,
  content_opportunity: z.string().nullable(),
  verification_status: VerificationStatus,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type CalendarEvent = z.infer<typeof CalendarEvent>

/* ------------------------------------------------------------------ */
/* Research broker                                                     */
/* ------------------------------------------------------------------ */

export const ResearchRequest = z.object({
  id: z.string(),
  requested_by: AgentName,
  question: z.string().min(5),
  /** Optional structured target so Agent 1 can answer deterministically. */
  metric: z.string().nullable().default(null),
  priority: Level,
  deadline: z.string().nullable(),
  required_sources: z.array(z.string()).default([]),
  status: ResearchStatus,
  response: z
    .object({
      summary: z.string(),
      fact_ids: z.array(z.string()),
      notes: z.string().nullable(),
    })
    .nullable()
    .default(null),
  created_at: z.string(),
  completed_at: z.string().nullable(),
})
export type ResearchRequest = z.infer<typeof ResearchRequest>

/* ------------------------------------------------------------------ */
/* Observability                                                       */
/* ------------------------------------------------------------------ */

export const RunError = z.object({
  step: z.string(),
  source: z.string().nullable(),
  message: z.string(),
  at: z.string(),
})
export type RunError = z.infer<typeof RunError>

export const SourceHealth = z.object({
  source_id: z.string(),
  ok: z.boolean(),
  items: z.number(),
  latency_ms: z.number(),
  error: z.string().nullable(),
})
export type SourceHealth = z.infer<typeof SourceHealth>

export const AgentRun = z.object({
  run_id: z.string(),
  parent_run_id: z.string().nullable(),
  agent: AgentName,
  job: JobName.nullable(),
  brief_date: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: RunStatus,
  items_collected: z.number(),
  items_verified: z.number(),
  items_rejected: z.number(),
  errors: z.array(RunError),
  sources: z.array(SourceHealth),
  execution_metadata: z.record(z.string(), z.unknown()),
})
export type AgentRun = z.infer<typeof AgentRun>

/* ------------------------------------------------------------------ */
/* Agent 2 output (LLM) — every claim must cite fact ids               */
/* ------------------------------------------------------------------ */

const Cited = { fact_ids: z.array(z.string()).default([]), cluster_ids: z.array(z.string()).default([]) }

export const WhatMattersItem = z.object({
  headline: z.string().min(3).max(160),
  /** 1–2 sentences: what happened and why it matters (QC enforces the sentence limit). */
  why_it_matters: z.string().min(10).max(420),
  ...Cited,
})
export type WhatMattersItem = z.infer<typeof WhatMattersItem>

/** "O que aconteceu" in one or two sentences, for the top of the Overview. */
export const Lede = z.object({ text: z.string().min(20).max(360), ...Cited })
export type Lede = z.infer<typeof Lede>

export const MacroWatchItem = z.object({ text: z.string().min(5).max(420), ...Cited })

/** Analytical lenses an insight touches (shown as tags). */
export const INSIGHT_LENSES = ['valuation', 'juros', 'duration', 'risco', 'crédito', 'liquidez', 'câmbio', 'inflação', 'crescimento', 'portfolio construction', 'wealth planning'] as const
export const InsightLens = z.enum(INSIGHT_LENSES)

export const Insight = z.object({
  title: z.string().min(3).max(120),
  what_happened: z.string().min(10).max(500),
  why_it_happened: z.string().min(10).max(600),
  what_it_changes: z.string().min(10).max(600),
  lenses: z.array(InsightLens).max(4).default([]),
  ...Cited,
})
export type Insight = z.infer<typeof Insight>

/** Wealth themes for the UHNW Lens. */
export const UHNW_THEMES = ['alocação', 'liquidez', 'proteção', 'sucessão', 'tributação', 'concentração', 'exposição internacional'] as const
export const UhnwTheme = z.enum(UHNW_THEMES)

export const UhnwPoint = z.object({ theme: UhnwTheme.nullable().default(null), text: z.string().min(10).max(420), ...Cited })
export type UhnwPoint = z.infer<typeof UhnwPoint>

/*
 * Content Lab. Stored snapshots are append-only, so the stored shape stays
 * lenient (older versions have no main_idea / reel script). Agent 2's input
 * schema (AnalysisOutput) is strict.
 */
const ideaTitle = z.string().min(3).max(140)
const ideaAngle = z.string().min(10).max(400)
const ideaMain = z.string().min(10).max(400)

export const ContentIdea = z.object({
  title: ideaTitle,
  angle: ideaAngle.or(z.string().min(10).max(500)),
  main_idea: z.string().nullable().default(null),
  hook: z.string().nullable().default(null),
  /** Format structure (newer versions): Story screens, carousel slides, static-post text. */
  frames: z.array(z.string()).default([]),
  slides: z.array(z.string()).default([]),
  post_text: z.string().nullable().default(null),
  ...Cited,
})
export type ContentIdea = z.infer<typeof ContentIdea>

export const ReelIdea = ContentIdea.extend({
  development: z.string().nullable().default(null),
  closing: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  on_screen: z.string().nullable().default(null),
})
export type ReelIdea = z.infer<typeof ReelIdea>

export const ContentLab = z.object({ story: ContentIdea, carousel: ContentIdea, reel: ReelIdea, take: ContentIdea })
export type ContentLab = z.infer<typeof ContentLab>

export const ContentIdeaInput = z.object({ title: ideaTitle, angle: ideaAngle, main_idea: ideaMain, ...Cited })
/** Story: 3–4 short screens (hook → dado → leitura → pergunta/CTA), not a caption. */
export const StoryIdeaInput = ContentIdeaInput.extend({ frames: z.array(z.string().min(3).max(120)).min(3).max(4) })
/** Carousel: exactly 5 slides (hook, contexto, dado, interpretação, conclusão). */
export const CarouselIdeaInput = ContentIdeaInput.extend({ slides: z.array(z.string().min(3).max(160)).length(5) })
/** Reel: video script, including what is shown on screen. */
export const ReelIdeaInput = ContentIdeaInput.extend({
  hook: z.string().min(5).max(200),
  development: z.string().min(20).max(500),
  on_screen: z.string().min(5).max(200),
  closing: z.string().min(10).max(300),
  cta: z.string().min(5).max(160),
})
/** Static post (stored under `take` for compatibility): concept + base text for the publication. */
export const PostIdeaInput = ContentIdeaInput.extend({ post_text: z.string().min(40).max(500) })
export const ContentLabInput = z.object({ story: StoryIdeaInput, carousel: CarouselIdeaInput, reel: ReelIdeaInput, take: PostIdeaInput })
export type ContentLabInput = z.infer<typeof ContentLabInput>

export const MacroWatch = z.object({
  BR: z.array(MacroWatchItem).max(3),
  US: z.array(MacroWatchItem).max(3),
  CN: z.array(MacroWatchItem).max(3),
  EU: z.array(MacroWatchItem).max(3),
})

export const AnalysisOutput = z.object({
  lede: Lede,
  what_matters: z.array(WhatMattersItem).min(1).max(7),
  macro_watch: MacroWatch,
  insights: z.array(Insight).max(3),
  uhnw_lens: z.array(UhnwPoint).max(3),
  content_lab: ContentLabInput,
})
export type AnalysisOutput = z.infer<typeof AnalysisOutput>

/* ------------------------------------------------------------------ */
/* Snapshot (one per brief version; history is append-only)            */
/* ------------------------------------------------------------------ */

export const MarketRow = z.object({
  metric: z.string(),
  label: z.string(),
  region: Region,
  value: z.number().nullable(),
  unit: z.string(),
  change_pct: z.number().nullable(),
  reference: z.string().nullable(),
  market_status: MarketStatus,
  verification_status: VerificationStatus,
  fact_id: z.string(),
  is_stale: z.boolean(),
  source_fallback: z.boolean(),
  verification_method: VerificationMethod.default('unavailable'),
  core: z.boolean().default(false),
  session: z.enum(['regular_close', 'intraday', 'fixing', 'continuous', 'settlement', 'official_close', 'release']).nullable().default(null),
  /**
   * Manual "Atualizar agora" only: the current (intraday) quote, kept apart from the official
   * close above. Always from an unofficial vendor, never VERIFIED, never cited by the brief.
   */
  live: z
    .object({ value: z.number(), change_pct: z.number().nullable(), observed_at: z.string(), reference_date: z.string(), source: z.string(), is_intraday: z.boolean() })
    .nullable()
    .default(null),
})
export type MarketRow = z.infer<typeof MarketRow>
export type LiveQuote = NonNullable<MarketRow['live']> & { metric: string }

export const MacroRow = z.object({
  metric: z.string(),
  label: z.string(),
  region: Region,
  value: z.number().nullable(),
  unit: z.string(),
  reference: z.string().nullable(),
  verification_status: VerificationStatus,
  fact_id: z.string(),
  is_stale: z.boolean(),
})
export type MacroRow = z.infer<typeof MacroRow>

export const AgendaItem = z.object({
  event_id: z.string(),
  name: z.string(),
  date: z.string(),
  time: z.string().nullable(),
  category: EventCategory,
  region: Region,
  importance: Level,
  source: z.string(),
  source_url: z.string().nullable(),
  verification_status: VerificationStatus,
  bucket: z.enum(['today', 'tomorrow', 'week', 'upcoming']),
  /** Timezone of `time` (the dashboard shows it converted to BRT). */
  timezone: z.string().default('America/Sao_Paulo'),
  /** Editorial opportunity for the event (Agent 3). */
  content_opportunity: z.string().nullable().default(null),
})
export type AgendaItem = z.infer<typeof AgendaItem>

export const SourceReference = z.object({ name: z.string(), url: z.string(), used_for: z.string() })
export type SourceReference = z.infer<typeof SourceReference>

export const QcCheck = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().nullable(),
  /** 'block' checks must pass for a snapshot to be PUBLISHED; 'warn' checks are advisory (e.g. target length). */
  severity: z.enum(['block', 'warn']).default('block'),
})
export type QcCheck = z.infer<typeof QcCheck>

export const QcReport = z.object({
  passed: z.boolean(),
  checks: z.array(QcCheck),
  word_count: z.number(),
  reading_minutes: z.number(),
  corrections: z.array(z.string()),
})
export type QcReport = z.infer<typeof QcReport>

export const ContentOpportunity = z.object({
  id: z.string(),
  event_id: z.string().nullable(),
  cluster_id: z.string().nullable(),
  title: z.string(),
  angle: z.string(),
  format: z.enum(['story', 'carousel', 'reel', 'take', 'post']),
  target_date: z.string(),
  priority: Level,
  status: z.enum(['IDEA', 'PLANNED', 'PUBLISHED', 'DISCARDED']),
  created_by: AgentName,
  created_at: z.string(),
})
export type ContentOpportunity = z.infer<typeof ContentOpportunity>

/* Rates: Treasury curve, derived spreads, DI1 buckets and policy rates (deterministic, from facts). */
export const RateVertex = z.object({
  metric: z.string(),
  label: z.string(),
  tenor: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  change_bps: z.number().nullable(),
  reference: z.string().nullable(),
  source: z.string().nullable(),
  verification_status: VerificationStatus,
  verification_method: VerificationMethod,
  fact_id: z.string(),
  instrument: Instrument.nullable().default(null),
  highlight: z.boolean().default(false),
  note: z.string().nullable().default(null),
})
export type RateVertex = z.infer<typeof RateVertex>

export const RatesSnapshot = z.object({
  treasury: z.array(RateVertex),
  spreads: z.array(RateVertex),
  di: z.array(RateVertex),
  policy: z.array(RateVertex),
})
export type RatesSnapshot = z.infer<typeof RatesSnapshot>

/* Coverage matrix: minimum floor of themes checked every morning (never filled artificially). */
export const CoverageCell = z.object({
  scope: z.enum(['BR', 'WORLD']),
  id: z.string(),
  label: z.string(),
  covered: z.boolean(),
  cluster_ids: z.array(z.string()),
  note: z.string().nullable().default(null),
})
export type CoverageCell = z.infer<typeof CoverageCell>

export const IntelligenceSnapshot = z.object({
  id: z.string(),
  date: z.string(),
  version: z.number().int().min(1),
  generated_at: z.string(),
  run_id: z.string(),
  status: z.enum(['PUBLISHED', 'DRAFT_FACTS_ONLY', 'AWAITING_ANALYSIS', 'FAILED_QC']),
  analysis_mode: z.enum(['anthropic_api', 'claude_code', 'deterministic']),
  market_snapshot: z.array(MarketRow),
  macro_snapshot: z.array(MacroRow),
  news_snapshot: z.array(EventCluster),
  lede: Lede.nullable().default(null),
  what_matters: z.array(WhatMattersItem),
  macro_watch: MacroWatch,
  insights: z.array(Insight),
  uhnw_lens: z.array(UhnwPoint),
  content_lab: ContentLab.nullable(),
  agenda: z.array(AgendaItem),
  source_references: z.array(SourceReference),
  content_opportunities: z.array(ContentOpportunity).default([]),
  qc: QcReport,
  limitations: z.array(z.string()).default([]),
  rates: RatesSnapshot.nullable().default(null),
  /** Clusters ranked just below the ones sent to Agent 2 (15–25): persisted, no tokens spent. */
  watchlist_candidates: z.array(EventCluster).default([]),
  coverage_matrix: z.array(CoverageCell).default([]),
  /** Hash of the submitted analysis: the same submission for the same date is idempotent. */
  analysis_hash: z.string().nullable().default(null),
})
export type IntelligenceSnapshot = z.infer<typeof IntelligenceSnapshot>

/* ------------------------------------------------------------------ */
/* Social metrics                                                      */
/* ------------------------------------------------------------------ */

export const SocialPostMetrics = z.object({
  post_id: z.string(),
  published_at: z.string(),
  format: z.enum(['story', 'carousel', 'reel', 'post']),
  content_type: z.enum(['contextual', 'news', 'educational', 'opinion', 'personal', 'other']).default('other'),
  topic: z.string().default('other'),
  caption: z.string().default(''),
  reach: z.number().nonnegative().default(0),
  impressions: z.number().nonnegative().default(0),
  views: z.number().nonnegative().default(0),
  watch_time_s: z.number().nonnegative().default(0),
  avg_watch_time_s: z.number().nonnegative().default(0),
  completion_rate: z.number().min(0).max(1).nullable().default(null),
  likes: z.number().nonnegative().default(0),
  comments: z.number().nonnegative().default(0),
  shares: z.number().nonnegative().default(0),
  saves: z.number().nonnegative().default(0),
  profile_visits: z.number().nonnegative().default(0),
  follows: z.number().nonnegative().default(0),
  link_clicks: z.number().nonnegative().default(0),
})
export type SocialPostMetrics = z.infer<typeof SocialPostMetrics>
