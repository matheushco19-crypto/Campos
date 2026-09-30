# Automação e jobs

## Mecanismos disponíveis (avaliados)
- **Vercel Cron:** escolhido para os jobs do backend (coleta, verificação, snapshot). Roda em UTC. O Brasil não tem horário de verão desde 2019, então `0 8 * * *` corresponde à hora das 05:00 BRT o ano todo. No plano Hobby o disparo acontece em algum minuto dessa hora: **janela 05:00–05:59 BRT, não exatamente 05:00**. Os crons só ficam ativos depois de um deploy de produção.
- **Rotinas do Claude Code (nativas):** usadas **só para a etapa de interpretação** no plano Claude Pro (sem API key). Não duplicam nenhum job: o cron produz os fatos, e a rotina escreve a análise a partir do pacote.

## Jobs (`config/jobs.ts`, `vercel.json`)
| Job | Horário (BRT) | UTC (vercel.json) | Endpoint | LLM |
|---|---|---|---|---|
| MORNING_INTELLIGENCE | janela 05:00–05:59 diária | `0 8 * * *` | `/api/cron/morning-intelligence` | 1 chamada (API) ou hand-off |
| MARKET_CLOSE_REFRESH | janela 18:00–18:59 dias úteis | `30 21 * * 1-5` | `/api/cron/market-close-refresh` | Não |
| WEEKLY_SOCIAL_STRATEGY | domingo, janela 08:00–08:59 | `0 11 * * 0` | `/api/cron/weekly-social-strategy` | 1 chamada (API) |
| ON_DEMAND_RESEARCH | sob demanda | — | `POST /api/research` | Não |
| Análise (Claude Code) | 06:15 diário (depois da janela do cron) | rotina | `GET/POST /api/analysis` | Assinatura Claude |

Para mudar a frequência, altere `vercel.json` (UTC) e `config/jobs.ts` (documentação e horário local).

**Plano Hobby da Vercel:** crons rodam no máximo uma vez por dia e podem disparar em qualquer minuto da hora marcada (05:00–05:59 BRT). Não há cron horário, polling nem retry por cron neste projeto. As funções usam `maxDuration` de 300 s.

## Publicação diária garantida (dois níveis)
1. **Nível 1, determinístico (sempre):** Agent 1 → Agent 3 → Agent 2 em modo determinístico → QC (modo apenas fatos) → snapshot `PUBLISHED` com `analysis_mode = deterministic`. Não depende do Claude Code nem de LLM.
2. **Nível 2, enriquecimento (opcional):** a rotina do Claude Code lê `GET /api/analysis`, escreve a análise e publica em `POST /api/analysis`. O QC roda de novo e, se aprovar, uma nova versão (append-only) substitui a determinística como versão exibida da mesma data. A mesma análise enviada duas vezes devolve a versão já publicada (`analysis_hash`), sem duplicar.

## Lock persistente (`job_leases`)
Cada cron e o botão "Rodar agora" passam por `withJobLease` (`src/storage/leases.ts`), com `run_key` `JOB:AAAA-MM-DD` e unicidade em `job_name + run_key`. Uma segunda chamada enquanto a primeira roda recebe `skipped: running`; depois de concluída, uma chamada duplicada do cron recebe `skipped: completed` e não cria notícias, snapshot nem agent run. Um lease `RUNNING` vencido ou `FAILED` pode ser assumido por exatamente um chamador (compare-and-delete). O botão manual pode rodar de novo depois de um run concluído e cria uma nova versão.

Autenticação: o Vercel envia `Authorization: Bearer $CRON_SECRET`. Sem `CRON_SECRET`, os endpoints recusam em produção.

## Rotina do Claude Code (etapa de interpretação)
Detalhes completos, com prompt, variáveis e diagnóstico, em [claude-code-routine.md](claude-code-routine.md). Resumo:
- Disparo: **06:15 BRT** (`CRON_TZ=America/Sao_Paulo 15 6 * * *`), sessão nova a cada disparo, depois da janela 05:00–05:59 do cron.
- Ambiente da rotina: variáveis **`MI_BASE_URL`** (URL de produção) e **`CRON_SECRET`** (o mesmo valor cadastrado na Vercel), e o domínio de produção liberado na política de rede.
- Fluxo: `node scripts/routine.mjs get` → escrever `analysis.json` → `node scripts/routine.mjs submit --file analysis.json`. O script envia `Authorization: Bearer $CRON_SECRET`, nunca imprime o segredo e falha (exit ≠ 0) em qualquer HTTP diferente de 200 ou status diferente de `PUBLISHED`.

## Rodar manualmente
- Dashboard: **/admin → "Rodar Morning Intelligence agora"** (`POST /api/run`).
- CLI: `npm run mi -- morning`.
- HTTP: `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DEPLOY/api/cron/morning-intelligence`.

## Verificar uma execução
`npm run mi -- runs --date D`, `npm run mi -- audit --date D`, ou a tabela `agent_runs` (veja [data-model.md](data-model.md)).
