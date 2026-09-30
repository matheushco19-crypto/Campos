# Agent 1: Market Intelligence & Research

## Fontes (validadas ao vivo em 29/09/2026, de um Vercel Sandbox em iad1)

### Mercado (Source Coverage Audit de 30/09/2026: veja [coverage-audit/README.md](coverage-audit/README.md))
| Fonte | Uso | Status validado |
|---|---|---|
| **Investing.com** | Referência de mercado para validação e pesquisa **manual** | **Sem crawler.** HTTP 403 (anti-bot), sem API pública, e os Termos de Uso proíbem coleta automatizada. Nenhuma tentativa de contornar. |
| brapi.dev (REST) | Ibovespa (B3), fonte primária | Plano gratuito cobre `^BVSP` com `BRAPI_TOKEN` gratuito. Câmbio, cripto e Selic são pagos na BRAPI (o PTAX é lido direto do BCB, que é a origem que a BRAPI documenta) |
| brapi.dev (MCP) | Ibovespa, pela sessão do Claude | Não roda no backend. Entra com `mi morning --observations obs.json`, com proveniência e as mesmas regras de verificação |
| FRED (St. Louis Fed) | S&P 500, Nasdaq, Dow, Nikkei 225, Treasury 10Y | OK (CSV público; API com `FRED_API_KEY`) |
| U.S. Treasury | Treasury 10Y (oficial) | OK |
| BCB PTAX (SGS 1 e 21619) | USD/BRL, EUR/BRL (oficial) | OK |
| ECB reference rates | EUR/BRL e USD/BRL como validação oficial; **DXY calculado** com a fórmula da ICE (aproximação, assim rotulado) | OK |
| Bank of Korea ECOS | KOSPI (802Y001/0001000) | OK com a chave pública `sample`; `BOK_ECOS_KEY` gratuita para produção |
| Coinbase, Kraken, Bitstamp, Gemini | BTC/USD (quatro exchanges independentes, sem chave) | OK |
| CoinGecko | BTC/USD | Pulada sem `COINGECKO_DEMO_KEY` (403 sem chave) |
| Stooq | Europa, Ásia, DXY, Ibovespa, câmbio | Pulada por padrão: 403 para IPs de datacenter. `MI_ENABLE_STOOQ=true` só onde responde |
| Twelve Data | Índices e DXY como fonte adicional | Requer `TWELVEDATA_API_KEY` (chave gratuita); cobertura de índices no plano gratuito não confirmada |

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
- Janela 05:00–05:59 BRT: MORNING_INTELLIGENCE (fechamento dos EUA, Ásia, Europa em negociação, câmbio, cripto, notícias de 30h, macro, agenda).
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
