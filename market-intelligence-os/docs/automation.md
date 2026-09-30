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
Prompt recomendado (sessão nova a cada disparo, 06:15 BRT, `CRON_TZ=America/Sao_Paulo 15 6 * * *`, depois da janela do cron do Hobby):

> Você é o Agent 2 do Market Intelligence OS. Leia `market-intelligence-os/docs/financial-intelligence.md`. Execute `curl -s -H "Authorization: Bearer $MI_CRON_SECRET" "$MI_BASE_URL/api/analysis"` para obter instruções, schema e pacote do dia. Se não houver pacote PENDING, encerre. Escreva a análise seguindo estritamente as instruções: todo número precisa estar em um fato citado, e notícia de fonte única deve ser atribuída. Salve em `analysis.json` e publique com `curl -s -X POST -H "Authorization: Bearer $MI_CRON_SECRET" -H "content-type: application/json" -d "{\"date\":\"AAAA-MM-DD\",\"analysis\":$(cat analysis.json)}" "$MI_BASE_URL/api/analysis"`. Se o QC retornar correções, revise e publique de novo. Não altere código.

Requisitos do ambiente da rotina: variáveis `MI_BASE_URL` e `MI_CRON_SECRET`, e o domínio do deploy liberado na política de rede.

## Rodar manualmente
- Dashboard: **/admin → "Rodar Morning Intelligence agora"** (`POST /api/run`).
- CLI: `npm run mi -- morning`.
- HTTP: `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DEPLOY/api/cron/morning-intelligence`.

## Verificar uma execução
`npm run mi -- runs --date D`, `npm run mi -- audit --date D`, ou a tabela `agent_runs` (veja [data-model.md](data-model.md)).
