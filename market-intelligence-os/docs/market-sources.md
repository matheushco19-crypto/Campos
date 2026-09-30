# Estratégia de fontes por ativo

Configuração em `config/assets.ts` (ordem das fontes = prioridade). Verificação em `src/verification/engine.ts`; exibição em `quoteView` (`src/components/MarketsTable.tsx`).

## Regras gerais
- **Automático (cron 05:00–05:59 BRT):** séries diárias usam só pregões concluídos. Se o dia ainda não fechou, vale o último fechamento ("Último fech. dd/mm"). Se todas as fontes falharem, o último fato persistido é reaproveitado dentro de `maxAgeDays` (mesmo valor, mesma data, `source_fallback`). Fora do prazo: indisponível, sem estimativa.
- **Manual ("Atualizar agora" → `POST /api/run?live=1`):** além das fontes oficiais, busca a cotação corrente (Yahoo v8 chart; BRAPI já devolve o preço corrente durante o pregão). A cotação corrente vira o valor principal da linha com o rótulo "AGORA · hh:mm · fonte", e o fechamento oficial aparece logo abaixo.
- **Yahoo:** fonte de exibição, ligada por padrão (`MI_ENABLE_YAHOO_FALLBACK=false` desliga fora do modo manual). Nunca conta para `VERIFIED` e nunca é citada no texto do briefing. No automático só entra com fechamento concluído mais novo que o oficial ("Fech. dd/mm · Yahoo · não oficial").
- **FRED:** API oficial (`FRED_API_KEY`), para fechamentos, histórico, Treasury e macro. Não é fonte intraday: publica o fechamento com cerca de 1 dia de atraso. Sem chave, o `fredgraph.csv` tem fail-fast após 2 timeouts.

## Tabela (testada em 30/09/2026)

| Métrica | Primária | Fallback | Live (manual) | Fechamento oficial | Verificação | Status |
|---|---|---|---|---|---|---|
| IBOV | BRAPI `^BVSP` | Yahoo `^BVSP` · último persistido | BRAPI (preço corrente) / Yahoo | BRAPI (dados B3) | UNVERIFIED `single_source` (sem 2ª fonte permitida) | OK com `BRAPI_TOKEN` |
| IFIX | BRAPI `IFIX.SA` | Yahoo `IFIX.SA` · último persistido | BRAPI / Yahoo | BRAPI (dados B3) | UNVERIFIED `single_source` | OK: o token atual retorna IFIX |
| S&P 500 | FMP (sem chave: pulado) → FRED `SP500` | Yahoo `^GSPC` · último persistido | Yahoo v8 | FRED (D-1) | UNVERIFIED `single_source` (FMP daria o cruzamento) | OK |
| Nasdaq | FMP → FRED `NASDAQCOM` | Yahoo `^IXIC` | Yahoo v8 | FRED (D-1) | UNVERIFIED `single_source` | OK |
| Dow Jones | FMP → FRED `DJIA` | Yahoo `^DJI` | Yahoo v8 | FRED (D-1) | UNVERIFIED `single_source` | OK |
| DXY | FMP (sem chave) → proxy ECB | Yahoo `DX-Y.NYB` | Yahoo v8 | — (índice da ICE) | UNVERIFIED `proxy` | OK (proxy sinalizado) |
| USD/BRL | PTAX (BCB) | ECB (cruzamento) · Yahoo `BRL=X` | Yahoo v8 | PTAX (fixing ≈13:30 BRT) | VERIFIED quando PTAX e ECB têm a mesma data | OK |
| EUR/BRL | PTAX (BCB) | ECB · Yahoo `EURBRL=X` | Yahoo v8 | PTAX | VERIFIED `independent_crosscheck` | OK |
| BTC/USD | Coinbase | Kraken, Bitstamp, Gemini · Yahoo | contínuo (24h) | — | VERIFIED `independent_crosscheck` | OK |
| Treasury 10Y | US Treasury (curva oficial) | FRED `DGS10` (mesma linhagem) | não (sem fonte intraday confiável) | US Treasury | VERIFIED `official_single` | OK |

**Status testado:** BRAPI `^BVSP` e `IFIX.SA` devolveram preço, fechamento anterior e horário. A API do FRED respondeu em 0,2–0,4 s para SP500, NASDAQCOM, DJIA, DGS10 e NIKKEI225. O Yahoo v8 chart devolveu `regularMarketPrice` e `regularMarketTime` para `^GSPC`, `^BVSP` e `IFIX.SA`; o v7 `/quote` responde 401 e não é usado.
