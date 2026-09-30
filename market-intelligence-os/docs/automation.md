# Automação e jobs

## Mecanismos disponíveis (avaliados)
- **Vercel Cron:** escolhido para os jobs do backend (coleta, verificação, snapshot). Roda em UTC. O Brasil não tem horário de verão desde 2019, então 05:00 BRT = 08:00 UTC o ano todo.
- **Rotinas do Claude Code (nativas):** usadas **só para a etapa de interpretação** no plano Claude Pro (sem API key). Não duplicam nenhum job: o cron produz os fatos, e a rotina escreve a análise a partir do pacote.

## Jobs (`config/jobs.ts`, `vercel.json`)
| Job | Horário (BRT) | UTC (vercel.json) | Endpoint | LLM |
|---|---|---|---|---|
| MORNING_INTELLIGENCE | 05:00 diário | `0 8 * * *` | `/api/cron/morning-intelligence` | 1 chamada (API) ou hand-off |
| MARKET_CLOSE_REFRESH | 18:30 dias úteis | `30 21 * * 1-5` | `/api/cron/market-close-refresh` | Não |
| WEEKLY_SOCIAL_STRATEGY | domingo 08:00 | `0 11 * * 0` | `/api/cron/weekly-social-strategy` | 1 chamada (API) |
| ON_DEMAND_RESEARCH | sob demanda | — | `POST /api/research` | Não |
| Análise (Claude Code) | 05:20 diário | rotina | `GET/POST /api/analysis` | Assinatura Claude |

Para mudar a frequência, altere `vercel.json` (UTC) e `config/jobs.ts` (documentação e horário local).

**Plano Hobby da Vercel:** crons rodam no máximo uma vez por dia e podem disparar em qualquer minuto da hora marcada (05:00–05:59 BRT). No Pro o horário é preciso. As funções usam `maxDuration` de 300 s.

Autenticação: o Vercel envia `Authorization: Bearer $CRON_SECRET`. Sem `CRON_SECRET`, os endpoints recusam em produção.

## Rotina do Claude Code (etapa de interpretação)
Prompt recomendado (sessão nova a cada disparo, 05:20 BRT, `CRON_TZ=America/Sao_Paulo 20 5 * * *`):

> Você é o Agent 2 do Market Intelligence OS. Leia `market-intelligence-os/docs/financial-intelligence.md`. Execute `curl -s -H "Authorization: Bearer $MI_CRON_SECRET" "$MI_BASE_URL/api/analysis"` para obter instruções, schema e pacote do dia. Se não houver pacote PENDING, encerre. Escreva a análise seguindo estritamente as instruções: todo número precisa estar em um fato citado, e notícia de fonte única deve ser atribuída. Salve em `analysis.json` e publique com `curl -s -X POST -H "Authorization: Bearer $MI_CRON_SECRET" -H "content-type: application/json" -d "{\"date\":\"AAAA-MM-DD\",\"analysis\":$(cat analysis.json)}" "$MI_BASE_URL/api/analysis"`. Se o QC retornar correções, revise e publique de novo. Não altere código.

Requisitos do ambiente da rotina: variáveis `MI_BASE_URL` e `MI_CRON_SECRET`, e o domínio do deploy liberado na política de rede.

## Rodar manualmente
- Dashboard: **/admin → "Rodar Morning Intelligence agora"** (`POST /api/run`).
- CLI: `npm run mi -- morning`.
- HTTP: `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DEPLOY/api/cron/morning-intelligence`.

## Verificar uma execução
`npm run mi -- runs --date D`, `npm run mi -- audit --date D`, ou a tabela `agent_runs` (veja [data-model.md](data-model.md)).
