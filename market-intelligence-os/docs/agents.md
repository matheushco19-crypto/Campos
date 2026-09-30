# Agentes

Um único sistema com três agentes especializados e um orquestrador, não três aplicações. Cada agente é um módulo com:

| Item | Agent 1 | Agent 2 | Agent 3 | Orchestrator |
|---|---|---|---|---|
| System instructions | `market-intelligence/instructions.ts` | `financial-intelligence/instructions.ts` | `social-strategist/instructions.ts` | (determinístico) |
| Input schema (Zod) | `Agent1Input` | `Agent2Input` | `Agent3Input` | `MorningOptions` |
| Output schema | `Agent1Output`, `CollectionBundle` | `AnalysisOutput` → `IntelligenceSnapshot` | `WeeklyStrategyOutput`, `ContentOpportunity[]` | `MorningResult` |
| Tools | collectors, `verifyAll`, `clusterNews` | `buildAnalysisPacket`, `callStructured`, `qualityControl` | `buildCalendar`, analytics | todos |
| Validações | plausibilidade, tolerâncias, datas | Zod + QC (12 checagens) | Zod | status por estágio |
| Erros | fonte a fonte, nunca fatal | fallback determinístico | calendário/opp. preservados | cada estágio isolado |
| Run logging | `agent_runs` (`RunLogger`) | idem | idem | run pai (`parent_run_id`) |

## Agent 1: Market Intelligence & Research
**Sabe o que aconteceu.** Guardião da factualidade. 100% determinístico no MVP: nenhum LLM copia números para o banco.
Coleta mercados (`config/assets.ts`), macro oficial (`config/macro.ts`), notícias RSS (`config/sources.ts`) e calendário oficial. Detalhes em [market-intelligence.md](market-intelligence.md).

## Agent 2: Financial Intelligence + CFP/CFA Analyst + Copywriter
**Entende o que aconteceu e por que importa.** Recebe só o *analysis packet*: fatos citáveis, fatos não citáveis (para saber o que falta), até 14 clusters de notícia com diversidade de tema, agenda e event-driven requests. Hierarquia: FATO → CONTEXTO → MECANISMO → IMPLICAÇÃO → OPINIÃO (sinalizada). Detalhes em [financial-intelligence.md](financial-intelligence.md).

## Agent 3: Social Strategist
**Sabe o que fazer com isso.** A rodada diária é determinística: Event Engine, oportunidades antecipadas (pré-evento e dia seguinte) e oportunidades a partir de eventos com alta relevância social. A revisão com LLM é semanal, antes de eventos relevantes ou sob demanda. Detalhes em [social-strategy.md](social-strategy.md).

## Orchestrator
Garante a ordem, isola falhas e grava o snapshot (append-only). Veja [architecture.md](architecture.md) e [automation.md](automation.md).

## Research Broker
Qualquer agente cria uma `research_request`. O Agent 1 mapeia a pergunta para uma métrica (`resolveMetric`), responde a partir de `verified_facts` ou faz uma **coleta direcionada só daquela métrica**, verifica e persiste. A resposta é sempre um conjunto de `fact_ids`. Se a pergunta não mapeia para uma métrica com fonte estruturada, o status é `FAILED` com a explicação, nunca uma estimativa.

```
Agent 3: "Qual a Selic hoje?" → research_request → Agent 1 → coleta/verifica → verified_facts → resposta {fact_ids}
```
Uso: dashboard (Research), `POST /api/research` ou `npm run mi -- research "..."`.
