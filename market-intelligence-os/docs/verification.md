# Verification Engine

`src/verification/engine.ts`. Todo fato material passa por:

```
RAW OBSERVATION → validateObservation (plausibilidade, data, URL) → verifyMarket / verifyMacro → VerifiedFact
```

## Estados
| Status | Significado | Pode aparecer no texto? |
|---|---|---|
| `VERIFIED` | Duas fontes independentes concordam (mercado), ou fonte oficial (macro) | Sim, se não estiver defasado |
| `UNVERIFIED` | Fonte única, datas de referência diferentes ou só fonte secundária | Não. Só na tabela, com badge |
| `CONFLICT` | Fontes divergem além da tolerância | Não. Nunca resolvido escolhendo um número |
| `REJECTED` | Falhou na validação (valor implausível, data futura, sem URL) | Não |
| `UNAVAILABLE` | Nenhuma fonte respondeu | Não. Valor nulo, nada estimado |

## Regras
**Mercado:** fonte A + fonte B **independentes**, mesma data de referência (exceto cripto 24/7), dentro da tolerância do ativo (0,5% para índices, 1% para câmbio e cripto, 3 bps para yields).
**Macro:** oficial + secundária no mesmo período e dentro da tolerância dá `VERIFIED/HIGH`. Só a oficial dá `VERIFIED/MEDIUM` com `single_source = true`, porque a fonte oficial é a autoridade do número. Com `MI_VERIFICATION_STRICT_MACRO=true`, ela vira `UNVERIFIED`. Só a secundária dá `UNVERIFIED` com `source_fallback`. Divergência no mesmo período dá `CONFLICT`.
**Notícias:** um evento (cluster) é `VERIFIED` com duas ou mais fontes independentes ou uma fonte oficial. Fonte única fica `UNVERIFIED`, e o Agent 2 é instruído a atribuir ("segundo o Valor...").
**Defasagem:** `is_stale` quando a referência excede `maxAgeDays`. Fato defasado nunca é citável.

## `verification_method` (todo fato)
| Método | Quando | Status |
|---|---|---|
| `independent_crosscheck` | Duas fontes de **linhagens diferentes** concordam na **mesma data de referência** (PTAX do BCB × referência do ECB; Coinbase × Kraken) | `VERIFIED/HIGH` |
| `official_crosscheck` | Duas fontes da **mesma origem oficial** concordam (BRAPI × B3; US Treasury × FRED DGS*; IBGE × SGS). Não é independência: é conferência com o publicador | `VERIFIED/HIGH` |
| `official_single` | Só o publicador oficial do instrumento respondeu (curva do Treasury, ajuste do DI1 na B3, PTAX, séries do BCB/IBGE) | `VERIFIED/MEDIUM` |
| `single_source` | Uma fonte não oficial, ou a segunda fonte tem outra data de referência | `UNVERIFIED` |
| `unofficial_vendor` | Só o Yahoo (desligado por padrão) respondeu. Nunca conta para `VERIFIED` | `UNVERIFIED` |
| `proxy` | Aproximação do instrumento (DXY calculado com taxas do ECB). Exibido como "DXY proxy" | `UNVERIFIED` |
| `derived` | Cálculo determinístico sobre fatos da mesma data (spreads 2s10s e 5s30s). `VERIFIED` só se as duas pontas forem `VERIFIED` | conforme as pontas |
| `conflict` / `unavailable` | Divergência além da tolerância / nenhuma fonte | `CONFLICT` / `UNAVAILABLE` |

A linhagem vem de `lineage` em `config/sources.ts` (ou do mapeamento do ativo em `config/assets.ts`). **Datas diferentes nunca são comparadas**: a "última observação" de duas fontes só vale como validação se a data de referência for a mesma. Não se fabrica segunda fonte: o IBOV só com BRAPI fica `UNVERIFIED/single_source`.

## Sessão (todo fato de mercado)
`session = { observed_at, reference_date, session, timezone, source, is_close, is_intraday, session_of, rule }`, gerado por `describeSession` (`collectors/market-status.ts`):

| Mercado | Sessão | Regra |
|---|---|---|
| EUA (NYSE) | `regular_close` / `intraday` | Às 05:00 BRT o pregão de NY está fechado: vale o fechamento anterior. Timestamps de feed antes da abertura pertencem ao pregão anterior (`sessionOf`) |
| Brasil (B3) | `regular_close` | Idem; o DI1 usa a taxa de ajuste (`settlement`) do arquivo consolidado da B3 |
| Europa | `intraday` → descartado | Às 05:00 BRT a Europa está aberta: séries diárias descartam a barra de hoje (`completedBars`) e usam o fechamento anterior |
| Ásia | `regular_close` | Tóquio/HK/Xangai/Seul já fecharam o dia quando o Brasil acorda: a barra de hoje é o fechamento de hoje |
| Câmbio | `fixing` | PTAX (BCB, ≈13:30 BRT) e referência do ECB (≈14:15 CET) são valores finais do dia |
| Treasury | `official_close` | Par yield curve publicada pelo Tesouro dos EUA |
| Cripto | `continuous` | Sem fechamento; valor instantâneo em `observed_at` |

Um valor intradiário nunca é exibido como fechamento (selo "INTRADIÁRIO" na tabela). O contrário também vale: um valor só é `intraday` se a data de referência for o pregão corrente da bolsa no momento da coleta. Uma série diária com a data de ontem, coletada com a bolsa aberta, é o fechamento de ontem: `regular_close`, com `market_status = OPEN`. Bundles importados têm a sessão e a classificação de notícias recalculadas pelas regras atuais, porque as duas são funções puras.

## Mercados: modo automático × manual
- **Automático (cron da manhã):** séries diárias usam só pregões concluídos (`completedBars`). Se nenhuma fonte responder para um ativo, o fato é preenchido com o **último fechamento oficial armazenado** (mesmo valor, mesma data de referência e mesma verificação), marcado `source_fallback` com a nota "Último fechamento oficial disponível…", desde que dentro de `maxAgeDays`. Fora do prazo continua `UNAVAILABLE`, sem estimativa.
- **Manual ("Atualizar agora" → `POST /api/run?live=1`):** além das fontes oficiais, busca a cotação corrente no endpoint JSON v8 do Yahoo (o v7 `/quote` responde 401 sem crumb). O valor oficial continua sendo o fato verificado; a cotação corrente fica em `market_snapshot[].live` (valor, variação contra o último fechamento, horário, fonte) e aparece como linha "AGORA … · Yahoo, não oficial". Nunca é `VERIFIED` e nunca é citada no texto.
- **FRED sem chave:** após 2 timeouts do `fredgraph.csv` na mesma coleta, as demais consultas sem chave falham de imediato com o motivo. Com `FRED_API_KEY` a API oficial é usada e nunca é pulada.

## Metric Alignment (`src/engines/metric-alignment.ts`)
A métrica nomeada no texto precisa ser a métrica do fato. Aliases: IPCA-15 → `BR_IPCA15_MOM`, IPCA → `BR_IPCA_MOM`/`BR_IPCA_12M`, IGP-M → `BR_IGPM_MOM`, payroll/nonfarm → `US_PAYROLLS_CHANGE`, CPI → `US_CPI_YOY`, PCE → `US_PCE_YOY`, Selic → `BR_SELIC_TARGET`, Selic efetiva → `BR_SELIC_EFFECTIVE`, CDI → `BR_CDI`, DI futuro/DI1Xnn → `BR_DI1_*`, FOMC/Fed Funds → `US_FED_FUNDS_UPPER`, taxa de depósito do BCE → `EU_ECB_DEPOSIT_RATE`, Treasury → `US10Y`/`US_UST_*`. ADP não tem métrica integrada.
1. Métrica nomeada com fato disponível e não citado → o fato é associado como evidência principal.
2. Afirmação de resultado sobre métrica sem fato disponível → bloqueia, salvo se o texto declarar o dado indisponível e não trouxer número.
3. Número de uma frase sustentado só por fato de outra métrica que a frase não nomeia → bloqueia (IPCA-15 com número do IPCA; payroll com ADP; FOMC com Treasury; Selic com DI).
4. Fato citado de uma métrica não nomeada, com uma métrica rival da mesma família nomeada sem evidência → bloqueia.

Aplica-se a lede, what_matters, insights, UHNW, macro watch e Content Lab (títulos, ângulos, roteiro), e o `metric_target` dos clusters vai no pacote do Agent 2.

## Provenance (todo fato)
`id, category, metric, value, unit, reference_period, as_of, retrieved_at, primary_source, secondary_source, primary_url, secondary_url, verification_status, verification_method, confidence, notes, created_at, updated_at`, mais `change_pct, previous_value, market_status, timezone, session, released_at, instrument, source_fallback, single_source, is_stale, brief_date, run_id`.

## Controle de qualidade do brief (18 checagens)
`src/engines/quality-control.ts`, rodado antes de salvar:
1. Todos os números têm fonte (**detecção de claims sem suporte**: extrai números em pt-BR e confere contra os fatos citados, incluindo variação, valor anterior, bps e escala "mil")
2. Fatos materiais são `VERIFIED` · 3. Nenhuma notícia duplicada · 4. Nenhum mercado aberto descrito como fechado · 5. Nenhum dado defasado como atual · 6. Insights separados dos fatos (com base citada, sem opinião no "o que aconteceu") · 7. Português · 8. Até 10 minutos de leitura (150 wpm) · 9. Content Lab curto e sem formatos genéricos ("5 dicas...") · 10. Agenda com fonte · 11. Sem linguagem genérica de IA (lista em `config/editorial-profile.ts`) · 12. Nenhuma experiência pessoal inventada · 13. 5 a 7 acontecimentos · 14. Cada acontecimento em 1–2 frases · 15. Notícia de fonte única atribuída ("segundo o Valor...") · 16. Sem recomendação individualizada · 17. Extensão na meta de 900–1.200 palavras (**consultiva**: gera aviso, não bloqueia) · 18. **Métrica citada = métrica do fato** (Metric Alignment, bloqueante). O português também é checado item a item.

**Correção antes de salvar:** remove as frases de preenchimento; corta acontecimentos para 2 frases; remove itens com claim sem suporte ou fato não verificado; adiciona `fact_id` quando o número bate com exatamente um fato citável; deduplica eventos; substitui a ideia de conteúdo inválida por um aviso; encurta seções de menor prioridade até caber em 10 minutos. O relatório fica em `snapshot.qc`.

**Gate de publicação:** se alguma checagem bloqueante ainda falhar depois das correções, a versão é gravada como `FAILED_QC` (nunca `PUBLISHED`) e a submissão do Claude Code volta com os motivos. O dashboard continua mostrando a última versão publicada.

## Auditoria
`npm run mi -- audit --date D` confere o snapshot publicado de forma independente: as linhas de mercado batem com os fatos, as citações apontam só para fatos citáveis, a reexecução do QC é idempotente, o Metric Alignment, o IPCA-15, Core Markets X/8 (aviso se < 8), nenhum proxy como `VERIFIED`, curva do Treasury (8 vértices) e DI (7 buckets), matriz de cobertura, watchlist, as contagens por seção, o tempo de leitura e as falhas de fonte.
