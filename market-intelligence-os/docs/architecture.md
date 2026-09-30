# Arquitetura

## Princípio

```
SOURCE → RAW DATA → NORMALIZATION → VALIDATION → VERIFICATION → VERIFIED_FACT → INTERPRETATION → CONTENT
```

Nunca `SOURCE → LLM → OUTRO LLM → "FATO"`. O LLM só entra depois de `verified_facts`, recebe apenas fatos citáveis e é obrigado a citar `fact_ids`. Um verificador determinístico confere cada número do texto contra os fatos citados.

## Visão geral

```
                    ┌────────────────────── ORCHESTRATOR ──────────────────────┐
 Vercel Cron 05:00 ─┤                                                          │
 (08:00 UTC)        │ 1 init run                                               │
                    │ 2-4 AGENT 1  ── collectors (APIs · CSV · RSS)             │
                    │      │            └─ raw_observations (auditoria)         │
                    │ 5-6  └─ VERIFICATION ENGINE ─► verified_facts             │
                    │         NEWS CLUSTERING ─────► news_items/event_clusters   │
                    │ 7   AGENT 3 (diário, determinístico)                      │
                    │      EVENT ENGINE ─► calendar_events · content_opportunities
                    │ 8-9 AGENT 2 ─ packet (só fatos citáveis) ─► LLM (1 chamada)│
                    │      └─ QUALITY CONTROL (12 checagens + correções)         │
                    │ 10  snapshot append-only ─► intelligence_snapshots (vN)    │
                    │ 11  RESEARCH BROKER (pendências)                           │
                    └──────────────────────────────────────────────────────────┘
                                         │
                                  DASHBOARD (Next.js)
```

**Decisão documentada:** o passo determinístico do Agent 3 (calendário e oportunidades) roda **antes** do Agent 2. Assim as event-driven content requests entram na mesma chamada de LLM do Morning Brief, sem uma segunda chamada. As responsabilidades não mudam.

## Modos de interpretação (economia de uso do Claude)

| Modo | Quando | Como |
|---|---|---|
| `claude_code` (padrão sem chave) | Claude Pro/Max | O pipeline grava um **analysis packet**. Uma rotina do Claude Code lê o pacote (`GET /api/analysis`), escreve a análise e publica (`POST /api/analysis`). |
| `anthropic_api` | Com `ANTHROPIC_API_KEY` | Uma chamada estruturada (`messages.parse` + Zod), system prompt congelado com prompt cache |
| `deterministic` | Sem LLM ou falha | Briefing só com fatos. Nenhuma interpretação é fabricada. |

O snapshot é salvo antes da análise (status `AWAITING_ANALYSIS`), então os fatos do dia aparecem no dashboard na hora. A análise publicada vira uma nova versão.

## Código × LLM

| Código (determinístico) | LLM |
|---|---|
| coleta, parsing, normalização, validação | interpretação |
| verificação e resolução de status | síntese |
| deduplicação, clustering, classificação de notícias | análise CFP/CFA |
| cálculos (yoy, variação, bps, métricas sociais) | linguagem e copy |
| QC, agenda, tabelas, fontes, persistência | estratégia editorial (semanal) |

## Fail-safe

- Uma fonte falha: fica registrada em `agent_runs.sources`, e o fato usa a próxima fonte ou vira `UNAVAILABLE`.
- Agent 1 falha: o pipeline segue e o snapshot registra as limitações.
- Agent 2 falha: os dados do Agent 1 são preservados e sai o briefing `DRAFT_FACTS_ONLY`.
- Agent 3 falha: o Morning Brief é preservado.
- Snapshots são **append-only**, com trigger no Postgres que bloqueia UPDATE/DELETE.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Lucide · Manrope (self-hosted, `@fontsource-variable`) · Recharts · Zod 4 · Supabase/Postgres · Vercel · Vitest · Playwright · `@anthropic-ai/sdk` · `fast-xml-parser`.
Componentes no estilo shadcn/ui foram escritos à mão (Panel, Pill, Section) para não adicionar dependências.

## Estrutura

```
market-intelligence-os/
  config/            fontes, ativos, macro, calendário, perfil editorial, jobs (tudo editável)
  src/agents/        market-intelligence · financial-intelligence · social-strategist · orchestrator
  src/verification/  verification engine
  src/engines/       news-classifier · news-clustering · quality-control · event-engine · research-broker · audit
  src/llm/           provider (Claude API)
  src/social/        SocialMetricsProvider + ManualImportProvider + analytics
  src/storage/       store (memory/file/supabase) + repository
  src/observability/ run-logger (agent_runs)
  src/app/           dashboard + API routes (cron, run, research, analysis, history, social)
  supabase/          migrations
  scripts/mi.ts      CLI
  tests/ e2e/        Vitest + Playwright
```
