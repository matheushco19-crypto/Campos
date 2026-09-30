# Provider bakeoff de dados de mercado (30/09/2026)

Script reproduzível: `node scripts/provider-bakeoff.mjs > bakeoff.json` (≈ 60 requisições; Twelve Data com 8 s entre cotações quando há chave). Resultado bruto desta execução: [`bakeoff-2026-09-30.json`](bakeoff-2026-09-30.json), coletado de um Vercel Sandbox (iad1) às 12:25 UTC.

Não foram testados nem integrados: Google Finance, TradingView, Investing.com, endpoints privados ou scraping de HTML.

## 1. Twelve Data
- **Credencial:** `TWELVEDATA_API_KEY` **não existe** no ambiente. A chave `demo` responde 401 para cotações de índice. **Nenhuma cotação foi testada.**
- **Símbolos descobertos** pelos endpoints de referência sem chave (`/indices`, 1.305 índices; `/forex_pairs`; `/cryptocurrencies`; fallback `/symbol_search`). Não se assumiu nenhum ticker.

| Ativo | Testado | Aceito | Mercado | Moeda | Observação |
|---|---|---|---|---|---|
| IBOV | BVSP, IBOV | **BVSP** | Bovespa | BRL | |
| S&P 500 | SPX, GSPC | — | — | — | Não consta do catálogo de índices; `symbol_search` só traz ETFs e homônimos |
| Nasdaq Composite | IXIC | — | — | — | Idem |
| Dow Jones | DJI | — | — | — | Idem |
| USD/BRL | USD/BRL | **USD/BRL** | forex | BRL | |
| EUR/BRL | EUR/BRL | **EUR/BRL** | forex | BRL | |
| BTC/USD | BTC/USD | **BTC/USD** | crypto | USD | |
| DXY | DXY, DX | — | — | — | Não consta |
| Euro Stoxx 50 | SX5E, STOXX50E | **STOXX50E** | SIX | EUR | |
| DAX | GDAXI, DAX | **GDAXI** | XETR | EUR | |
| FTSE 100 | FTSE, UKX | **FTSE** | LSE | GBP | |
| Nikkei 225 | N225 | **N225** | JPX | JPY | |
| Hang Seng | HSI | **HSI** | HKEX | HKD | |
| Shanghai Composite | 000001, SSEC | **000001** | SSE | CNY | |
| KOSPI | KS11, KOSPI | **KOSPI** | KRX | KRW | |

Cobertura de catálogo: 11 de 15 ativos. Os três índices americanos core e o DXY ficam fora. Endpoint, HTTP status, valor, timestamp, atraso e disponibilidade no plano ficam registrados como "não testado" no JSON até existir uma chave.

## 2. Financial Modeling Prep
`FMP_API_KEY` **não existe** no ambiente: teste pulado (registrado no JSON). O adapter (`fmp`, endpoint `/stable/quote`, uma chamada por símbolo) está pronto e mapeado como primeira fonte de S&P 500, Nasdaq, Dow e DXY. Fica inativo sem a chave.

## 3. Yahoo Finance (prova de conceito técnica)
Endpoint JSON `query1.finance.yahoo.com/v8/finance/chart/{símbolo}?range=5d&interval=1d`, não documentado oficialmente. **15/15 ativos com HTTP 200.**

| Ativo | Símbolo | Valor | Timestamp (UTC) | Última barra diária | Cruzamento com a fonte integrada |
|---|---|---|---|---|---|
| IBOV | ^BVSP | 183.827,6 | 29/09 20:18 | 29/09 | BRAPI 183.827,6 (29/09): igual |
| S&P 500 | ^GSPC | 7.670,84 | 29/09 20:38 | 29/09 | FRED SP500 7.670,84 (29/09): igual |
| Nasdaq | ^IXIC | 26.797,54 | 29/09 21:15 | 29/09 | FRED 26.797,54: igual |
| Dow | ^DJI | 51.349,92 | 29/09 20:38 | 29/09 | FRED 51.349,92: igual |
| USD/BRL | BRL=X | 5,1884 | 30/09 12:25 | 30/09 (intradiário) | Não comparável com a PTAX de 29/09 (sessão diferente) |
| EUR/BRL | EURBRL=X | 5,8927 | 30/09 12:24 | 30/09 (intradiário) | Idem |
| BTC/USD | BTC-USD | 83.897 | 30/09 12:25 | contínuo | Coinbase/Kraken ≈ 83.854 |
| DXY | DX-Y.NYB | 101,249 | 30/09 12:15 | 30/09 (intradiário) | Proxy ECB 101,269 (29/09): data diferente |
| Euro Stoxx 50 | ^STOXX50E | 6.297,89 | 30/09 12:10 | 30/09 (intradiário) | — |
| DAX | ^GDAXI | 25.308 | 30/09 12:10 | 30/09 (intradiário) | — |
| FTSE 100 | ^FTSE | 10.636,57 | 30/09 12:10 | 30/09 (intradiário) | — |
| Nikkei | ^N225 | 66.753,72 | 30/09 06:45 | 30/09 | FRED NIKKEI225 66.753,72: igual |
| Hang Seng | ^HSI | 24.613,27 | 30/09 08:08 | 30/09 | — |
| Shanghai | 000001.SS | 3.842,20 | 30/09 07:00 | 30/09 | — |
| KOSPI | ^KS11 | 6.838,04 | 30/09 11:05 | 30/09 | BOK 6.870,81 é de 29/09: data diferente |

Observação sobre o JSON bruto: o campo `previous_close` dessa execução é o `chartPreviousClose` do Yahoo (fechamento anterior ao **início** da janela de 5 dias), não o fechamento do dia anterior. O script foi corrigido para gravá-lo como `chart_previous_close`. O adapter usa as barras diárias, não esse campo.

## 4. Matriz comparativa e escolha

| Ativo | Twelve Data | FMP | Yahoo | Oficial / independente | Escolhido hoje |
|---|---|---|---|---|---|
| IBOV | catálogo ✔, cotação não testada | não testado | ✔ (não oficial) | BRAPI (dados B3) | **BRAPI**; TD como 2ª fonte quando houver chave. Sem 2ª fonte gratuita e permitida hoje: `UNVERIFIED/single_source` |
| S&P 500 | ✘ fora do catálogo | adapter pronto, sem chave | ✔ (não oficial) | FRED SP500 (mesmo pregão) | **FRED**; FMP quando houver chave, com cruzamento na mesma data |
| Nasdaq | ✘ | idem | ✔ | FRED NASDAQCOM | **FRED** (idem) |
| Dow | ✘ | idem | ✔ | FRED DJIA | **FRED** (idem) |
| USD/BRL | ✔ catálogo | — | ✔ intradiário | PTAX (BCB) + ECB | **PTAX × ECB**: `independent_crosscheck` |
| EUR/BRL | ✔ catálogo | — | ✔ intradiário | PTAX (BCB) + ECB | **PTAX × ECB** |
| BTC/USD | ✔ catálogo | — | ✔ | Coinbase, Kraken, Bitstamp, Gemini | **Exchanges**: `independent_crosscheck` |
| Treasury 3M–30Y | — | — | — | US Treasury + FRED DGS* | **US Treasury** (`official_single`; FRED só confirma quando a data é a mesma) |
| DI1 | — | — | — | B3 Arquivos Públicos | **B3** (`official_single`) |
| DXY | ✘ | adapter pronto, sem chave | ✔ (não oficial) | — | **Proxy ECB** exibido como "DXY proxy" (`proxy`, nunca VERIFIED) |
| Euro Stoxx 50, DAX, FTSE | ✔ catálogo | — | ✔ | — | **Twelve Data** quando houver chave; hoje `UNAVAILABLE` |
| Nikkei | ✔ catálogo | — | ✔ | FRED NIKKEI225 | **FRED**; TD como 2ª fonte com chave |
| Hang Seng, Shanghai | ✔ catálogo | — | ✔ | — | **Twelve Data** quando houver chave; hoje `UNAVAILABLE` |
| KOSPI | ✔ catálogo | — | ✔ | BOK ECOS | **BOK**; TD como 2ª fonte com chave |

**Critérios** (1–10 do pedido): cobertura (TD 11/15 no catálogo, Yahoo 15/15, FMP desconhecido); estabilidade (oficiais > TD/FMP > Yahoo, que não tem contrato); precisão (Yahoo bateu com FRED/BRAPI nos 5 casos com a mesma data); timestamp e sessão (TD e Yahoo trazem timestamp de feed e exigem `sessionOf`/`completedBars`; oficiais trazem data de referência explícita); batch (TD e FMP têm batch pago/limitado; Yahoo não); limites gratuitos (TD e FMP publicam cotas diárias no plano gratuito; os valores não foram verificados neste teste, por falta de chave; Yahoo não publica limite nem termos para esse uso); manutenção (um vendor unificado reduz adapters); cross-check (só vale com a mesma data de referência); adequação ao uso interno (fonte citável precisa de proveniência estável).

**Decisão:** a arquitetura fica **vendor unificado + cross-check oficial/independente + fallback**.
- **Vendor unificado:** Twelve Data para índices globais (Europa e Ásia) e FMP para os três índices americanos e o DXY. As duas entram sozinhas quando `TWELVEDATA_API_KEY` / `FMP_API_KEY` forem cadastradas; sem elas o comportamento atual se mantém. **Decisão humana:** cadastrar ou não as chaves (plano gratuito, sem custo).
- **Oficial/independente:** PTAX, ECB, US Treasury, B3, BCB/IBGE e exchanges de cripto continuam como autoridade e cross-check. Nenhuma fonte oficial foi removida.
- **Fallback:** Yahoo, desligado por padrão (`MI_ENABLE_YAHOO_FALLBACK=false`), sempre `unofficial_vendor`, nunca conta para `VERIFIED` e nunca é a única base de um VERIFIED. **Decisão humana:** manter desligado (recomendado) ou ligar só como referência de exibição.
