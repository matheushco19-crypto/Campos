# Primeiro teste real: 29/09/2026

"RUN MORNING INTELLIGENCE NOW", executado sem esperar as 05:00.

## Como foi executado
1. **Coleta real (Agent 1):** o container desta sessão não tinha saída de rede para as fontes, então os coletores (o mesmo código de produção) rodaram num **Vercel Sandbox** (iad1) com rede aberta, às 23:32 UTC. O resultado é o `bundle-2026-09-29.json`: 35 observações, 338 notícias (para o transporte, as 90 mais relevantes pelo score determinístico) e 8 eventos oficiais do IBGE.
2. **Verificação, Agent 3, pacote:** pipeline local com o bundle (`morning --bundle ... --mode claude_code`).
3. **Agent 2:** análise escrita pelo Claude Code a partir do pacote, via hand-off (o fluxo de produção do Claude Pro), em `analysis-2026-09-29.json`.
4. **Publicação:** `submit` → validação Zod + QC (**0 correções necessárias**, 1.135 palavras, 7,6 min).
5. **Auditoria automática:** `audit-2026-09-29.json`, veredito **PASS_WITH_WARNINGS**.

## Resultado da verificação
20 fatos VERIFIED · 5 UNVERIFIED · 1 REJECTED · 10 UNAVAILABLE.
- VERIFIED: USD/BRL (PTAX × ECB), EUR/BRL (PTAX × ECB), BTC (Coinbase × Kraken), IPCA mensal e 12m (IBGE × BCB), desemprego BR (IBGE × BCB), payroll, CPI e desemprego EUA (BLS × FRED), além dos oficiais de fonte única (Selic Focus, IGP-M, IBC-Br, dívida, Fed Funds, PIB EUA, ECB).
- UNVERIFIED: S&P 500, Nasdaq, Dow e Nikkei (só FRED respondeu, porque o Stooq bloqueia datacenter), Treasury 10Y (Treasury e FRED com datas de referência diferentes).
- **REJECTED:** Selic meta. A série SGS 432 é preenchida pelo BCB até a próxima reunião do Copom (2026-11-04), e a validação barrou a data futura. O coletor foi corrigido (considera só pontos até hoje), mas o dado deste run não foi "consertado" à mão.
- UNAVAILABLE: Ibovespa, DXY, Europa, Hang Seng, Shanghai, Kospi (exigem `BRAPI_TOKEN`/`TWELVEDATA_API_KEY`), China.
- Defasados (fora do texto): PCE e HICP.

## Achados que viraram correções
- Stooq e CoinGecko retornam 403 para IPs de datacenter, e Investing.com retorna 403. Tudo documentado, com fontes alternativas (ECB FX como validação oficial do câmbio).
- Novos feeds validados: Valor, Estadão, BCB Notas, MarketWatch, FT, NYT. O URL da CNN Brasil foi corrigido.
- Fixings passam a ser CLOSED. O IBGE não publica mais um horário sem confirmação do fuso.
- Timestamps de processamento foram separados dos timestamps da fonte (replays de bundle).

## Reproduzir
```bash
npm run mi -- morning --bundle docs/first-run/bundle-2026-09-29.json --mode claude_code --offline
npm run mi -- packet --date 2026-09-29      # os fact_ids mudam a cada run; ajuste o analysis.json se for reenviar
npm run mi -- audit --date 2026-09-29
```

![Overview](dashboard-overview.png)
