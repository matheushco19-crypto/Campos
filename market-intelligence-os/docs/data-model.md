# Modelo de dados

Supabase/Postgres, com a migration em `supabase/migrations/20260929120000_market_intelligence_init.sql`. Timestamps em UTC (`timestamptz`), convertidos para America/Sao_Paulo na interface. **RLS habilitado em todas as tabelas, sem policies:** só o service role (servidor) acessa, e a chave anon não lê nada. Os mesmos nomes de coluna valem nos stores de arquivo e de memória.

| Tabela | Chave | Conteúdo |
|---|---|---|
| `verified_facts` | `id` (hash de data + métrica + run) | Single source of truth dos agentes 2 e 3. Um registro por métrica por execução; o dashboard usa o mais recente do dia |
| `raw_observations` | `id` | Trilha de auditoria: o que cada coletor retornou |
| `news_items` | `id` (hash da URL) | Notícia com provenance e `event_cluster_id` |
| `event_clusters` | `id` | Evento deduplicado com N fontes |
| `calendar_events` | `id` | Event Engine |
| `research_requests` | `id` | Research Broker (PENDING → IN_PROGRESS → COMPLETED/FAILED/CONFLICT) |
| `agent_runs` | `run_id` | Observabilidade (agent, job, status, contagens, errors, sources, metadata, `parent_run_id`) |
| `intelligence_snapshots` | `id` = `snap_{date}_v{n}`, único (date, version) | **Append-only** (trigger bloqueia UPDATE/DELETE). Brief completo do dia |
| `analysis_packets` | `id` | Hand-off para a rotina do Claude Code |
| `social_posts` | `post_id` | Métricas importadas |
| `content_opportunities` | `id` | Oportunidades do Agent 3 |
| `strategy_reports` | `id` | Revisões semanais |

## Snapshot (`intelligence_snapshots`)
`date, version, generated_at, run_id, status (PUBLISHED | DRAFT_FACTS_ONLY | AWAITING_ANALYSIS | FAILED_QC), analysis_mode, market_snapshot, macro_snapshot, news_snapshot, what_matters, macro_watch, insights, uhnw_lens, content_lab, agenda, source_references, content_opportunities, qc, limitations`.
Cada execução cria uma nova versão. O dashboard mostra a mais recente e permite abrir qualquer versão anterior.

## Investigar "por que o briefing de hoje não foi produzido?"
```sql
select agent, status, started_at, errors, execution_metadata
from agent_runs where brief_date = current_date order by started_at desc;
```
Ou use a área administrativa (`/admin`, que responde isso automaticamente) ou `npm run mi -- runs --date AAAA-MM-DD`.
