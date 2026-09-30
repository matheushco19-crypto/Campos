# Source Coverage Audit: camada de dados de mercado (30/09/2026)

Pedido: auditar a camada de dados de mercado antes de qualquer funcionalidade nova, verificar se a BRAPI conectada ao Claude é usada pelo Agent 1 e cobrir o máximo possível **sem assinatura paga**. O Investing.com fica fora: sem crawler, sem contornar 403 ou CAPTCHA.

Ordem de verificação: A. BRAPI/MCP → B. APIs já existentes → C. fontes oficiais → D. alternativas gratuitas e permitidas. Todos os testes de rede rodaram num Vercel Sandbox (iad1), o mesmo tipo de IP de datacenter da produção.

## A. BRAPI: estava sendo usada pelo Agent 1?
**Não.** Havia dois motivos:
1. O adaptador REST (`brapi`) existia, mas era pulado porque `BRAPI_TOKEN` não está configurado. Sem token, a REST responde 401.
2. O MCP da BRAPI existe apenas dentro da sessão do Claude. O backend (Vercel Cron) não tem acesso a ele.

O que foi feito:
- **Ponte MCP → Agent 1:** `runMorningIntelligence({ extraObservations })` e `npm run mi -- morning --observations obs.json`. As observações externas precisam citar uma fonte registrada (senão são recusadas e o erro é registrado), mantêm URL, horário e nota de proveniência, e passam pela mesma validação e verificação. Uma fonte única nunca vira VERIFIED.
- **Correção no adaptador REST:** a BRAPI carimba o horário da última atualização do feed, não da sessão. Um horário antes da abertura ou em fim de semana agora pertence ao pregão anterior, e depois do fechamento vale como fechamento do dia (`sessionOf`). Antes, uma atualização depois da meia-noite rotularia o fechamento de 29/09 como 30/09.
- **Plano gratuito da BRAPI** (conferido pelo MCP e pela documentação):

| Instrumento | BRAPI gratuita? | Decisão |
|---|---|---|
| Ibovespa (`^BVSP`) | **Sim** (cotação e histórico) | Fonte primária do IBOV |
| USD/BRL, EUR/BRL | Não (plano pago). A BRAPI documenta o PTAX do BCB como origem | O PTAX é lido **direto do BCB** (SGS 1 e 21619), a origem oficial. Proveniência registrada como "BCB PTAX" |
| BTC/USD | Não (plano pago) | Exchanges gratuitas (abaixo) |
| Selic, inflação | Não (plano pago) | BCB/IBGE direto (já era assim) |
| Demais ativos do sistema | Não se aplica (a BRAPI cobre B3) | — |

## Tabela de cobertura por ativo
Status: 1º run (29/09, antes da auditoria) → run pós-auditoria (mesma data de referência).

| Ativo | Primária | Secundária | Método | Automático? | Chave? | Alternativa gratuita | Frequência | Timestamp | Qualidade | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Ibovespa | BRAPI (B3) | — (não existe 2ª fonte gratuita e permitida) | REST com token gratuito; MCP na sessão do Claude | Sim com `BRAPI_TOKEN`; hoje via MCP | Token gratuito | Nenhuma: SGS 7 descontinuada, BOVA11 não é o índice, Stooq bloqueia | Intradiária / fechamento | Horário do feed → sessão (`sessionOf`) | Alta (dado da B3) | UNAVAILABLE → **UNVERIFIED** (fonte única) |
| USD/BRL | BCB PTAX | ECB (EUR/BRL ÷ EUR/USD) | API oficial | Sim | Não | — | Diária (fixing) | Data do fixing | Oficial | VERIFIED → VERIFIED |
| EUR/BRL | BCB PTAX | ECB | API oficial | Sim | Não | — | Diária (fixing) | Data do fixing | Oficial | VERIFIED → VERIFIED |
| S&P 500 | FRED (SP500) | Twelve Data (chave) | CSV público | Sim | Não | Nenhuma 2ª sem chave | Diária | Data de referência | Alta | UNVERIFIED → UNVERIFIED |
| Nasdaq | FRED (NASDAQCOM) | Twelve Data (chave) | CSV público | Sim | Não | — | Diária (FRED com 1 dia de defasagem) | Data de referência | Alta | UNVERIFIED → UNVERIFIED |
| Dow Jones | FRED (DJIA) | Twelve Data (chave) | CSV público | Sim | Não | — | Diária | Data de referência | Alta | UNVERIFIED → UNVERIFIED |
| Treasury 10Y | U.S. Treasury | FRED DGS10 | CSV oficial | Sim | Não | — | Diária | Data de referência | Oficial | UNVERIFIED → UNVERIFIED (o FRED publica com 1 dia de defasagem, então as datas não coincidem) |
| DXY | **ECB, calculado** (fórmula ICE com 6 taxas de referência) | Twelve Data (chave) | API oficial + fórmula pública | Sim | Não | O índice oficial da ICE é licenciado | Diária | 14:15 CET da data das taxas | Aproximação, rotulada como tal | UNAVAILABLE → **UNVERIFIED** |
| Euro Stoxx 50 | — | Twelve Data (chave) | — | Não | — | Nenhuma diária: o ECB FM só tem média mensal, e a STOXX licencia | — | — | — | UNAVAILABLE → UNAVAILABLE |
| DAX | — | Twelve Data (chave) | — | Não | — | Nenhuma diária: o Bundesbank publica só estatística mensal, e a Deutsche Börse licencia | — | — | — | UNAVAILABLE → UNAVAILABLE |
| FTSE 100 | — | Twelve Data (chave) | — | Não | — | Nenhuma: a LSEG licencia | — | — | — | UNAVAILABLE → UNAVAILABLE |
| Nikkei 225 | FRED (NIKKEI225) | Twelve Data (chave) | CSV público | Sim | Não | O CSV da Nikkei responde 403 | Diária | Data de referência | Alta | UNVERIFIED → UNVERIFIED |
| Hang Seng | — | Twelve Data (chave) | — | Não | — | Só endpoints internos do site da HSI, que não são API pública | — | — | — | UNAVAILABLE → UNAVAILABLE |
| Shanghai Composite | — | Twelve Data (chave) | — | Não | — | Só endpoints internos do site da SSE | — | — | — | UNAVAILABLE → UNAVAILABLE |
| Kospi | **Bank of Korea ECOS** (oficial) | Twelve Data (chave) | API oficial | Sim | Chave `sample` pública; `BOK_ECOS_KEY` gratuita | — | Diária | Data de referência | Oficial | UNAVAILABLE → **UNVERIFIED** |
| BTC/USD | Coinbase | Kraken, **Bitstamp**, **Gemini** | APIs públicas de exchange | Sim | Não | CoinGecko (chave demo gratuita) | Contínua (24/7) | Horário da cotação | Alta (4 exchanges independentes) | VERIFIED → VERIFIED |

## Fontes efetivamente funcionando (sem chave, sem custo)
BCB PTAX, ECB (câmbio e DXY calculado), U.S. Treasury, FRED (CSV), Bank of Korea ECOS (chave `sample`), Coinbase, Kraken, Bitstamp e Gemini. A BRAPI funciona via MCP; no backend, com token gratuito.

## Fontes indisponíveis
| Fonte | Motivo | Tratamento |
|---|---|---|
| Investing.com | 403 (anti-bot), sem API, e os Termos proíbem coleta automatizada | Só referência manual. Nenhum crawler |
| Stooq | 403 para IPs de datacenter | Pulada por padrão (`MI_ENABLE_STOOQ=false`), sem martelar a fonte todo dia |
| CoinGecko sem chave | 403 | Pulada sem `COINGECKO_DEMO_KEY` |
| Yahoo Finance | Termos de uso | Não integrado |
| HSI, SSE, Nikkei (sites) | Endpoints internos ou 403 | Não integrado |
| BCB SGS 7 (Ibovespa) | Descontinuada | Não integrada |

## Quais APIs exigem chave
| Chave | Custo | Libera |
|---|---|---|
| `BRAPI_TOKEN` | Gratuita | Ibovespa no backend (cron das 05:00) |
| `BOK_ECOS_KEY` | Gratuita | KOSPI em produção (a `sample` é limitada) |
| `TWELVEDATA_API_KEY` | Gratuita (plano básico) | Possível 2ª fonte para índices e DXY; a cobertura de índices no plano gratuito não foi confirmada |
| `FRED_API_KEY` | Gratuita | API oficial do FRED (o CSV público já funciona) |
| `COINGECKO_DEMO_KEY` | Gratuita | 5ª fonte de BTC (redundância) |

Nenhuma assinatura paga foi feita, e nenhuma é necessária.

## Resultado do novo run (end-to-end)
Coleta real no sandbox às 01:17 UTC de 30/09 (ainda 29/09 em São Paulo), com 39 observações, 331 notícias (90 transportadas, pelo score determinístico) e 13 eventos do IBGE. O Ibovespa entrou pelo MCP da BRAPI (`brapi-mcp-observations-2026-09-29.json`).

| | 1º run | Pós-auditoria |
|---|---|---|
| VERIFIED | 20 | **21** (Selic de volta) |
| UNVERIFIED | 5 | 8 (IBOV, DXY e KOSPI saíram de UNAVAILABLE) |
| REJECTED | 1 | **0** |
| UNAVAILABLE | 10 | **7** (Euro Stoxx 50, DAX, FTSE 100, Hang Seng, Shanghai, China CPI, LPR) |
| Ativos de mercado UNAVAILABLE (16 auditados) | 8 | **5** |

- Snapshot `snap_2026-09-29_v6`: PUBLISHED, QC com 0 correções, 1.168 palavras, 7,8 min de leitura.
- Auditoria automática (`audit-2026-09-29-r2.json`): **PASS_WITH_WARNINGS**. Todas as 30 citações apontam para fatos VERIFIED e atuais, e as 16 linhas de mercado conferem com `verified_facts`. O único aviso é a lista de 403 do Stooq nesse bundle, que foi coletado antes de o Stooq virar opt-in.
- O Ibovespa aparece no texto só de forma atribuída ("segundo o Valor…"), sem número, porque o valor da BRAPI é de fonte única.

## Correções que a auditoria gerou
- Novos adaptadores: Bitstamp, Gemini, ECB-DXY e BOK ECOS.
- Ponte MCP e proveniência.
- `sessionOf` para carimbos de quote.
- Selic (SGS 432): o BCB preenche a série para frente até o próximo Copom, então `ultimos/N` podia devolver só datas futuras. Séries diárias agora consultam uma janela que termina hoje. Foi regressão pega por este run.
- Fontes que bloqueiam o host viram opt-in (Stooq, CoinGecko sem chave).
- Registro de fontes atualizado (Investing como manual, notas de plano da BRAPI).
- 65 testes unitários.

## O que ainda depende de você (tudo gratuito)
1. Criar a conta gratuita na brapi.dev e adicionar `BRAPI_TOKEN` na Vercel. O Ibovespa passa a entrar sozinho no cron das 05:00.
2. (Opcional) Criar a chave gratuita do Bank of Korea (`BOK_ECOS_KEY`).
3. (Opcional) Criar a chave gratuita da Twelve Data. É a única via sem custo que pode dar uma 2ª fonte a S&P, Nasdaq, Dow, Nikkei e DXY, e alguma cobertura de Europa e Ásia. A cobertura do plano gratuito precisa ser confirmada com a chave.

Lacunas que **não** têm solução gratuita e permitida: Euro Stoxx 50, DAX, FTSE 100, Hang Seng, Shanghai (sem chave) e uma 2ª fonte independente para o Ibovespa. Os provedores oficiais licenciam esses dados, e as alternativas seriam scraping ou violação de termos.
