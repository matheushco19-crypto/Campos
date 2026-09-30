# Agent 1: Market Intelligence & Research

## Fontes (validadas ao vivo em 29/09/2026, de um Vercel Sandbox em iad1)

### Mercado
| Fonte | Uso | Status validado |
|---|---|---|
| **Investing.com** | Prioridade 1 pedida pelo usuário | **Não integrada.** HTTP 403 (anti-bot), sem API pública, e os Termos de Uso proíbem coleta automatizada. Todo dado de mercado sai com `source_fallback = true`. |
| FRED (St. Louis Fed) | S&P 500, Nasdaq, Dow, Nikkei 225, Treasury 10Y | OK (CSV público; API com `FRED_API_KEY`) |
| U.S. Treasury | Treasury 10Y (oficial) | OK |
| BCB PTAX (SGS 1 e 21619) | USD/BRL, EUR/BRL (oficial) | OK |
| ECB reference rates | EUR/BRL e USD/BRL (EUR/BRL ÷ EUR/USD), como validação oficial | OK |
| Coinbase, Kraken | BTC/USD (duas exchanges independentes) | OK |
| CoinGecko | BTC/USD | 403 sem chave. Configure `COINGECKO_DEMO_KEY` |
| Stooq | Europa, Ásia, DXY, Ibovespa | **403 para IPs de datacenter.** Mantido como tentativa |
| brapi.dev | Ibovespa (B3) | Requer `BRAPI_TOKEN` |
| Twelve Data | Europa/Ásia/DXY | Requer `TWELVEDATA_API_KEY` |

**Consequência honesta:** sem `BRAPI_TOKEN` e `TWELVEDATA_API_KEY`, Ibovespa, Euro Stoxx 50, DAX, FTSE, Hang Seng, Shanghai, Kospi e DXY ficam `UNAVAILABLE`. O sistema não estima nada. Com as chaves, entram automaticamente, sem mudança de código.

### Macro (fonte oficial é a autoridade)
| Indicador | Oficial | Validação |
|---|---|---|
| Selic meta | BCB SGS 432 | (Focus como expectativa) |
| IPCA mensal / 12m | IBGE SIDRA 1737 (v63 / v2265) | BCB SGS 433 / 13522 |
| IGP-M | BCB SGS 189 (FGV) | |
| Desemprego | IBGE SIDRA 6381/4099 | BCB SGS 24369 |
| IBC-Br | BCB SGS 24364 | |
| Dívida bruta | BCB SGS 13762 | |
| Focus IPCA/Selic | BCB Olinda (Expectativas) | |
| CPI, desemprego, payroll (EUA) | BLS | FRED |
| Fed Funds (teto), PCE, PIB (EUA) | FRED (Fed/BEA) | |
| ECB depósito, HICP, desemprego (zona do euro) | ECB Data Portal | |
| China CPI, LPR | NBS/PBoC **não integrados** (sem API) | Importação manual com URL oficial |

### Notícias (RSS)
BBC Business, g1 Economia, InfoMoney, CNN Brasil, Exame, Valor, Estadão Economia, BCB Notas à imprensa (oficial), Fed Press (oficial), ECB Press (oficial), CNBC Markets, MarketWatch, FT Markets, NYT Business.
Reuters e AP **não têm RSS público**, o acesso exige licença. Documentado em `config/sources.ts`.

Conteúdo externo é tratado como não confiável: tags e scripts são removidos, e o resumo é limitado a 400 caracteres (só manchete e resumo curto, nunca trechos longos). O pacote enviado ao LLM avisa que o conteúdo é dado, não instrução.

## Calendário oficial
- Seed com fontes (`config/calendar-seed.ts`): eleições (CF art. 77, VERIFIED), FOMC, Copom, ECB e payroll (UNVERIFIED até confirmação, com link oficial).
- Feriados nacionais calculados (Páscoa pelo algoritmo gregoriano).
- API de calendário do IBGE (VERIFIED). O horário não é publicado porque o fuso da API não é documentado.

## Rotinas
- 05:00 BRT: MORNING_INTELLIGENCE (fechamento dos EUA, Ásia, Europa em negociação, câmbio, cripto, notícias de 30h, macro, agenda).
- 18:30 BRT (dias úteis): MARKET_CLOSE_REFRESH (só mercados, sem LLM).
- Intraday: research requests sob demanda. Sem polling.

`market_status` por observação: `OPEN` (intraday), `CLOSED` (fechamento da data de referência), `PRE_MARKET`. Fixings (PTAX, ECB) são sempre `CLOSED`. Um mercado em negociação **nunca** é apresentado como fechado: o QC bloqueia textos com "fechou" citando fato `OPEN`.

## Como alterar fontes
1. **Nova fonte de mercado:** adicione o `SourceDefinition` em `config/sources.ts` e o `case` em `collectors/market.ts` (endpoint documentado + parser em `parsers.ts` + teste com fixture).
2. **Novo ativo:** adicione o item em `config/assets.ts` (fontes em ordem de prioridade, tolerância, sessão, `maxAgeDays`). Os ativos futuros (Brent, WTI, ouro, cobre) já estão lá com `enabled: false`.
3. **Novo indicador macro:** adicione em `config/macro.ts` (`official` + `secondary` + `transform`).
4. **Novo feed RSS:** adicione a fonte e a URL em `RSS_FEEDS`.
5. Rode `npm run mi -- collect --out b.json` num ambiente com rede e confira `health`.

## Limitações conhecidas
- A série HICP `ICP.M.U2...` termina em 2025-12, provavelmente pela mudança de composição da zona do euro. A defasagem é detectada e o dado fica fora do briefing. Confirmar a nova chave.
- FRED `CPIAUCNSL` retornou 404 intermitente no CSV público. O CPI segue verificado pela fonte oficial (BLS).
- A série OECD de CPI da China no FRED está descontinuada.
