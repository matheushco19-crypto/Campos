# Relevância, overrides, choques de mercado e cobertura

Tudo determinístico (`src/engines/relevance.ts`, configuração em `config/relevance.ts`). Nenhuma chamada de LLM filtra, classifica ou ordena notícias.

## Pipeline (Agent 1)
coletar → normalizar → deduplicar → classificar (`news-classifier`) → **score por item** (semente de cada cluster) → clusterizar → **score por cluster** → **hard overrides** → seleção (top / watchlist / cauda) → **matriz de cobertura**.
- **Top 10–14 clusters** vão para o pacote do Agent 2.
- **Próximos até 25** ficam em `watchlist_candidates` (snapshot) e com `rank_bucket = watchlist` em `event_clusters`. Não entram no pacote nem consomem tokens.
- **Todas** as notícias e todos os clusters (inclusive a cauda) são persistidos.

## `relevance_score` (0–100)
| Componente | Peso | Base |
|---|---|---|
| Materialidade | 25 | `importance` do classificador; piso 0,8 para hard overrides; 1,0 para divulgação oficial casada com fato verificado; ×0,6 para manchetes de agenda/resumo |
| Fontes | 20 | Nº de veículos distintos (1 → 0,25 · 2 → 0,6 · 3 → 0,8 · 4+ → 1), multiplicado por (0,5 + 0,5 × materialidade) |
| Impacto de mercado | 20 | `market_relevance`; 1,0 com sinal de choque relacionado ou divulgação oficial; piso 0,7 para overrides |
| Novidade | 15 | Horas até a execução das 05:00 (≤12 h → 1 · ≤24 h → 0,7 · ≤36 h → 0,4) |
| Autoridade | 10 | Fonte oficial 1,0 · imprensa 0,6 |
| Wealth | 10 | `uhnw_relevance` |

Os pesos não são dogma: ficam em `RELEVANCE_WEIGHTS` e `RELEVANCE_TUNING`. A calibração de 30/09 corrigiu dois problemas vistos em dado real: a história leve repetida por três veículos acima de divulgações oficiais, e a manchete de mercado que só menciona "inflação" tomando o lugar do IPCA-15.

## Hard overrides
Banco central, ECB, regulador, inflação, emprego, PIB/atividade, fiscal/tributário, soberano/rating, crise bancária, geopolítica/guerra/sanções, choque de petróleo, evento corporativo sistêmico, **divulgação oficial** (cluster cujo `metric_target` tem fato verificado divulgado nos últimos 7 dias) e **movimento extraordinário de mercado**. A seleção garante o melhor cluster de cada classe no top. O que não couber vai para o topo da watchlist, nunca é descartado. Override garante presença, não manchete.

## Sinais de choque de mercado
`SHOCK_THRESHOLDS`: IBOV 2%, S&P 1,5%, Nasdaq 2%, Dow 1,5%, USD/BRL e EUR/BRL 1,5%, UST 2Y 12 bps, UST 10Y 10 bps, DI1 12M/60M 20 bps, BTC 5%. O sinal descreve só o movimento ("USD/BRL: +2,1% no dia (limiar 1,5%)"). Não gera narrativa causal. Vai para o pacote em `market_signals` e para os clusters relacionados.

## Matriz de cobertura
Brasil: macro, fiscal/monetário, mercados, regulação/economia real. Mundo: EUA, Europa, China/Ásia, geopolítica, commodities, mercados globais. Se uma categoria não tem evento no top, o melhor cluster elegível (score ≥ 30) é promovido. Sem candidato, a célula fica **descoberta** e sinalizada: nunca é preenchida artificialmente.

## Orçamento do pacote do Agent 2 (`PACKET_BUDGET`)
Máximo de 36.000 caracteres, 32 fatos citáveis, 14 clusters, 12 itens de agenda e resumo de 240 caracteres. Ordem de preservação: fatos core → overrides → clusters de maior relevância → agenda → contexto → fatos secundários. O corte é determinístico e registrado em `packet.budget.truncated`. `agent_runs` guarda `packet_chars`, `packet_estimated_tokens` (caracteres ÷ 4), `facts_count`, `clusters_count`, `agenda_count`, `provider_calls`, `retries` e `elapsed_ms`.
