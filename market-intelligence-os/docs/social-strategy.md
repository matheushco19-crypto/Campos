# Agent 3: Social Strategist

Estrategista de crescimento e diretor editorial: posicionamento, audiência, autoridade, consistência, narrativa, frequência, formatos, timing e performance.

## Frequência (economia de uso)
| Rodada | LLM? | O que faz |
|---|---|---|
| Diária (dentro do MORNING_INTELLIGENCE) | Não | Event Engine, calendário persistido, oportunidades antecipadas, flag de revisão pré-evento |
| Semanal (domingo 08:00 BRT) | Sim, só em `anthropic_api` | Padrões de performance + plano semanal + o que dobrar/parar + riscos |
| Antes de eventos relevantes | Flag (`preEventReview`, evento HIGH em até 2 dias) | Vai como event-driven request para o Agent 2, na mesma chamada do brief |
| On-demand | `npm run mi -- weekly` | Revisão completa |

## Event Engine
Categorias: MACRO, MARKET, POLICY, TAX, REGULATION, TECH, CORPORATE, GEOPOLITICS, HOLIDAY, SOCIAL.
Cada evento tem: `name, date, time, timezone, source, importance, market_relevance, audience_relevance, content_opportunity`, mais `verification_status` e `source_url`.
Oportunidades: para cada evento relevante nos próximos 14 dias, um conteúdo **pré-evento** (dia anterior) e uma **leitura do dia seguinte**, publicada só após o dado verificado pelo Agent 1. Nunca "Post sobre Selic". Sempre o mecanismo.

## Como alterar o calendário
- **Evento pontual com fonte oficial:** adicione em `config/calendar-seed.ts`. Use `VERIFIED` só se conferiu na fonte oficial; senão, `UNVERIFIED` com o link.
- **Feriados:** calculados em `src/engines/event-engine.ts` (`brazilHolidays`).
- **Divulgações do IBGE:** automáticas (API oficial). Os produtos monitorados estão em `IBGE_KEY_RELEASES`.
- Ângulos padrão por categoria: `CATEGORY_ANGLE` em `src/agents/social-strategist/index.ts`.

## Social analytics
`SocialMetricsProvider` → `ManualImportProvider` (CSV/JSON). A integração com Meta Graph API **não existe no MVP** e não é simulada. A interface está pronta para uma implementação futura.
Importação: `npm run mi -- import-social metricas.csv` ou `POST /api/social/import`. Aceita aliases de colunas (pt/en, Meta Business Suite).
Métricas: reach, impressions, views, watch time, average watch time, completion rate, likes, comments, shares, saves, profile visits, follows, link clicks.
Derivadas: engagement rate, save rate, share rate, profile conversion, follow conversion, content efficiency (peso maior para shares, saves e follows).
Padrões (determinísticos): medianas por tipo de conteúdo, formato e tema, com lift ≥ 20% e n ≥ 3 por grupo. Exemplo: *"Conteúdos de explicação contextual tiveram compartilhamentos (mediana) 300% maior que puramente noticiosos (n=4 vs n=4)."*

Colunas recomendadas para o CSV: `post_id, date, format (reel|carousel|story|post), content_type (contextual|news|educational|opinion|personal), topic, reach, impressions, views, likes, comments, shares, saves, profile_visits, follows, link_clicks, avg_watch_time_s, completion_rate`.
