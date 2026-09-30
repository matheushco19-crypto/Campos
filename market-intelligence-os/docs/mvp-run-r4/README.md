# Rodada 4: Release Candidate (30/09/2026)

**Veredito da auditoria: `PASS_WITH_WARNINGS` para software e dados. A produção NÃO está validada: não existe deployment.**

| Dimensão | Resultado | Por quê |
|---|---|---|
| A. CODE HEALTH | **PASS** | 156/156 testes unitários, typecheck e build limpos, E2E 14/14 (7 desktop + 7 mobile). Nenhum segredo no repositório |
| B. DATA RELIABILITY | **PASS_WITH_WARNINGS** | Core Markets 4/8 VERIFIED. IBOV, S&P 500, Nasdaq e Dow ficam UNVERIFIED/`single_source`, sem segunda fonte fabricada. Os outros avisos estão listados abaixo |
| C. AUTOMATION RELIABILITY | **PASS no código, cron NÃO observado** | Leases A–F e concorrência testados. Snapshot determinístico sempre publicado. Hand-off idempotente. Cron: **CONFIGURED, NOT YET OBSERVED IN PRODUCTION** |
| D. PRODUCTION DEPLOYMENT | **NOT VALIDATED** | 0 deployments na Vercel. O env de produção não tem 3 variáveis obrigatórias. Precisa de ação humana (detalhes abaixo) |

Nada aqui foi publicado em URL pública. Todas as execuções foram locais, num Vercel Sandbox (coleta) ou no Supabase de produção (schema e sondas em transação com ROLLBACK).

## 1. Run com dados reais (novo, não reaproveitado)
- **Coleta (Agent 1):** Vercel Sandbox iad1, 30/09 14:16 UTC, commit `8db2ea0`. 64 observações, 338 notícias (337 após dedupe), **78/78 consultas a fontes OK**. As falhas do FRED de r3 sumiram (seção 6). md5 do bundle `d6fe5a3c…` (`bundle-2026-09-30.json`).
- **IBOV:** veio do MCP da BRAPI às 14:23 UTC, com a B3 **aberta** (185.442,02 intradiário). O valor intradiário foi **descartado**. O run matinal usa o fechamento de 29/09, 183.827,6 (`regularMarketPreviousClose`, igual à barra diária de 29/09). Registro em `brapi-mcp-observations-2026-09-30.json`.
- **Processamento:** local, com o código final, a partir do bundle. A classificação de notícias e o rótulo de sessão são **recalculados** na importação, porque ambos são funções puras. Assim o run auditado reflete as regras atuais.
- **Fatos:** 55 (41 VERIFIED, 7 UNVERIFIED, 7 UNAVAILABLE, 0 CONFLICT, 0 REJECTED). Arquivo `facts-2026-09-30.json`.
- **Snapshots:** v1 `PUBLISHED`/`deterministic`, v2 `PUBLISHED`/`claude_code` (952 palavras, 6,3 min). O reenvio idêntico devolveu **v2**: nenhuma v3 (`submit-2026-09-30.json`).
- **Auditoria:** `audit-2026-09-30.json` e reexecução `audit-2026-09-30-rerun.json`, **idênticas**. Resultado **PASS_WITH_WARNINGS**; o único aviso é Core 4/8.

### Casos reais do Metric Alignment
Na submissão do Agent 2 (`submit-2026-09-30.json`), o QC associou como evidência principal os fatos das métricas nomeadas no texto: IPCA (2×), Selic meta (2×), Payroll e Focus Selic. Também removeu um ponto UHNW de fonte única sem atribuição.

**Controle negativo** (`qc-negative-control-2026-09-30.json`): feito numa cópia descartável do store, sobre os fatos reais. Foram inseridas de propósito duas substituições semânticas, e o QC **removeu as duas**:
- "IPCA-15 ficou em -0,32%": o número é do `BR_IPCA_MOM` (IPCA de agosto) → *"vem de IPCA (variação mensal), mas a frase fala de IPCA-15"*.
- "O FOMC levou os juros para 5,26%": o número é do `US10Y` → *"vem de Treasury 10Y, mas a frase fala de FOMC / Fed Funds"*.

O IPCA-15 publicado usa `BR_IPCA15_MOM`: 0,70% (2026-09), divulgado em 25/09, VERIFIED/`official_crosscheck` (SIDRA 7062 × SGS 7478).

## 2. Core Markets: **4/8 VERIFIED**
| Ativo | Valor | Ref. | Sessão | Status / método |
|---|---|---|---|---|
| IBOV | 183.827,6 | 29/09 | regular_close | UNVERIFIED / single_source (BRAPI) |
| S&P 500 | 7.670,84 | 29/09 | regular_close | UNVERIFIED / single_source (FRED) |
| Nasdaq | 26.797,54 | 29/09 | regular_close | UNVERIFIED / single_source (FRED) |
| Dow | 51.349,92 | 29/09 | regular_close | UNVERIFIED / single_source (FRED) |
| USD/BRL | 5,2204 | 29/09 | fixing | VERIFIED / official_single (PTAX)¹ |
| EUR/BRL | 5,9178 | 29/09 | fixing | VERIFIED / independent_crosscheck (PTAX × ECB 5,9177) |
| Treasury 10Y | 5,26% | 29/09 | official_close | VERIFIED / official_single (US Treasury)² |
| BTC/USD | 84.210 | 30/09 | continuous | VERIFIED / independent_crosscheck (Coinbase × Kraken) |

¹ O ECB publicou a taxa de 30/09 durante a coleta (14:16 UTC). A PTAX de 30/09 só sai por volta das 16:30 UTC. Com datas diferentes, **a comparação não é feita**, e a PTAX fica como fonte oficial única. No horário real do cron (05:00–05:59 BRT) as duas fontes têm a mesma data (29/09), como em r3.
² O FRED DGS10 tinha 28/09: datas diferentes, sem cruzamento.

## 3. Curvas de juros
- **Treasury:** 8/8 vértices (3M 4,25 · 6M 4,36 · 1Y 4,58 · 2Y 4,89 · 5Y 5,06 · 10Y 5,26 · 20Y 5,64 · 30Y 5,59), todos de 29/09. **2s10s = 10Y − 2Y = 37 bps (+5)**. **5s30s = 30Y − 5Y = 53 bps (+3)**. Método `derived`.
- **DI1 (taxa de ajuste B3, 29/09):** 1M DI1X26 13,656 · 3M DI1F27 13,550 · 6M DI1J27 13,529 · 12M DI1V27 13,559 · 24M DI1V28 13,747 · 36M DI1V29 13,908 · 60M **DI1V31 13,997% (venc. 2031-10-01, 1.252 du, −6 bps)**. Contratos reais, sem interpolação.
- **Juros oficiais:** Selic meta 13,75%, Selic efetiva 13,65%, CDI 13,65%, Fed Funds (teto) 4,00%, depósito do BCE 2,50%. Cada um é uma métrica separada.

## 4. News Intelligence
337 notícias → 313 clusters → **Top 14 / watchlist 25 / cauda 274**, com 17 hard overrides. Cobertura **10/10** (Brasil 4, Mundo 6). Ranking completo em `clusters-ranking-2026-09-30.json`.

Correções desta rodada, feitas com dado real e cobertas por teste:
1. **Falso negativo de cobertura.** Ásia (cluster com relevância 50) e Commodities (45) apareciam como "Nenhum evento coletado", porque as vagas reservadas acabavam antes. Agora o piso de cobertura desloca o cluster de menor score preenchido por score, mas nunca um override nem o último cluster de outra categoria. Se não houver como abrir vaga, a nota diz a verdade ("Evento elegível … não coube no top; segue na watchlist") e o evento vai para a watchlist logo depois dos overrides.
2. **"US$" lido como EUA.** "Ucrânia … déficit de US$ 27 bi" era classificada como EUA.
3. **"Leia também: … EUA …"** no resumo do feed mudava a região. Links relacionados agora são ignorados na classificação.
4. **Override amplo.** "Invasão de IA em site do governo" disparava Geopolítica; `invasão` agora exige contexto militar. Ucrânia e Rússia passam a contar como região Europa.

## 5. Pacote e custo
23.825 caracteres (≈ 5.957 tokens), 32 fatos, 14 clusters, 8 itens de agenda. Corte registrado: "fatos citáveis 40 → 32". Chamadas de API de LLM: **0** (modo `claude_code`: 1 análise por dia, feita pela rotina). Retries: 0. Nenhuma notícia bruta, HTML ou item da cauda vai para o pacote.

## 6. Falhas de fonte (FRED)
- `CPIAUCNSL`: HTTP 404 no endpoint usado. O substituto natural, CPIAUCSL, é dessazonalizado e não serve como conferência do CPI YoY publicado pelo BLS. A secundária foi removida; o US CPI continua VERIFIED pelo BLS.
- `CHNCPIALLMINMEI`: série da OECD descontinuada (2025-04). O CN CPI fica como `UNAVAILABLE` declarado e não é mais consultado.

Resultado: 78/78 consultas OK neste run. Detalhes em `config/macro.ts`.

## 7. Sessão: bug real corrigido (BLOCKER 12 evitado)
A coleta real rodou com Nova York **aberta** (10:16 ET). O S&P 500, Nasdaq e Dow vinham do FRED com a data de 29/09 (fechamento), mas recebiam o selo **INTRADIÁRIO**. Correção: um valor só é intradiário se a data de referência for o pregão corrente da bolsa. O status do mercado continua "Em negociação", porque a bolsa está aberta, mas o valor é o fechamento de 29/09. Teste de regressão com o caso real incluído.

## 8. Supabase (`supabase-verification.json`, `supabase-schema.json`)
- A migration `mvp_round3` foi **aplicada nesta rodada** (estava ausente) no projeto `hourclrikooygkrinjoc`. Há só 2 migrations, sem duplicata. As **21/21 colunas** da Round 3 estão presentes, assim como `job_leases` com `UNIQUE(job_name, run_key)`.
- **RLS:** ligado em 13/13 tabelas, com 0 policies. **Decisão intencional:** as tabelas são internas e o acesso é só pela service role (server-side). Nenhuma policy pública foi criada. Advisors de segurança: só INFO (`rls_enabled_no_policy`).
- **Prova de não exposição:** dentro de uma transação com ROLLBACK, uma linha inserida pelo owner ficou **invisível** para `anon` e `authenticated`. Um INSERT como `anon` foi **negado** pela RLS.
- Teste de escrita com linhas reais em 7 tabelas: OK. Linhas removidas.
- O banco de produção está vazio (0 snapshots): nunca houve run de produção.

## 9. Ambiente de produção (nomes apenas, sem valores)
| Variável | Classe | Na Vercel |
|---|---|---|
| SUPABASE_URL | REQUIRED | configurada |
| SUPABASE_SERVICE_ROLE_KEY | REQUIRED | **NOT CONFIGURED** |
| CRON_SECRET | REQUIRED | **NOT CONFIGURED** |
| DASHBOARD_PASSWORD | REQUIRED | **NOT CONFIGURED** |
| MI_STORAGE (=supabase) | REQUIRED | configurada |
| MI_LLM_PROVIDER (=claude_code) | OPTIONAL | configurada |
| BRAPI_TOKEN | OPTIONAL | NOT CONFIGURED |
| TWELVEDATA_API_KEY | OPTIONAL | NOT CONFIGURED |
| FMP_API_KEY | OPTIONAL | NOT CONFIGURED |
| BOK_ECOS_KEY | OPTIONAL | NOT CONFIGURED |
| FRED_API_KEY, COINGECKO_DEMO_KEY | OPTIONAL | NOT CONFIGURED |
| ANTHROPIC_API_KEY | NOT NEEDED (modo claude_code) | — |

O deployment **não depende silenciosamente** dessas variáveis:
- `/api/health` responde **503** com `missing_required_env: [nomes]` enquanto faltar alguma obrigatória;
- sem `DASHBOARD_PASSWORD`, o dashboard na Vercel responde 503 (*fail-closed*);
- sem `CRON_SECRET`, o cron e `/api/analysis` respondem 503.

Tudo isso foi comprovado no smoke local (`smoke-test-local.md`).

## 10. Vercel e o blocker de produção
O projeto `prj_dfcJ…Im4D` existe, com framework nextjs, Node 24.x, `live: false`, **0 deployments**, sem domínios e com SSO protection em `all_except_custom_domains`. A API não expõe o Root Directory nem o vínculo com o git, então **não foi possível confirmá-los**. `vercel.json` e o app ficam em `market-intelligence-os/`.

**Nenhum deployment de validação foi criado.** Sem `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` e `DASHBOARD_PASSWORD`, o deploy responderia 503 por projeto e não validaria nada além do smoke local já feito. A service role key só existe no painel do Supabase e deve ser cadastrada por uma pessoa.

**Ação humana necessária:**
1. Na Vercel, conferir Root Directory = `market-intelligence-os` e o repositório/branch conectados.
2. Cadastrar as 3 variáveis obrigatórias (Production).
3. Autorizar o primeiro deploy.

Depois disso: smoke de produção (`/`, `/api/health`, `/api/analysis`, `/api/cron/morning-intelligence`, leitura e escrita no Supabase) e observação do primeiro cron.

**Smoke test de produção: NOT TESTED** (não há deployment). Smoke local em modo produção: todas as checagens OK (`smoke-test-local.md`).

## 11. Automação
- **Cron:** `0 8 * * *` = janela 05:00–05:59 BRT (Hobby: o horário exato não é garantido). Status: **CONFIGURED, NOT YET OBSERVED IN PRODUCTION**.
- **Rotina Claude Code:** 06:15 BRT → GET `/api/analysis` → análise → POST `/api/analysis` → Zod → Metric Alignment → QC → v2. Reenvio idêntico devolve a mesma versão. Duas submissões simultâneas: uma é processada, a outra recebe **409** ("em andamento"), e as versões nunca colidem (retry de versão no insert).
- **job_leases:** cenários A–F e aquisição concorrente testados (`tests/round3.test.ts`). Duas chamadas simultâneas de `MORNING_INTELLIGENCE:data` resultam em 1 execução, 1 skip e nenhum snapshot duplicado.
- **Fallback:** sem LLM, o snapshot sai `PUBLISHED`/`deterministic` (v1 deste run).

## 12. Providers
| Ativo | Twelve Data | FMP | Yahoo (POC, não oficial) | Oficial / independente | Fonte final | Verificação |
|---|---|---|---|---|---|---|
| IBOV | NOT TESTED — credential absent (catálogo: BVSP) | NOT TESTED — credential absent | 200 · 185.331,55 · 30/09 intradiário | BRAPI (dados B3) | BRAPI | UNVERIFIED / single_source |
| S&P 500 | fora do catálogo | NOT TESTED — credential absent | 200 · 7.711,99 · intradiário | FRED SP500 | FRED | UNVERIFIED / single_source |
| Nasdaq | fora do catálogo | NOT TESTED — credential absent | 200 · 27.044,84 · intradiário | FRED NASDAQCOM | FRED | UNVERIFIED / single_source |
| Dow | fora do catálogo | NOT TESTED — credential absent | 200 · 51.422,86 · intradiário | FRED DJIA | FRED | UNVERIFIED / single_source |
| USD/BRL | NOT TESTED — credential absent | — | 200 · 5,1782 · intradiário | PTAX + ECB | PTAX × ECB | VERIFIED (official_single neste run¹) |
| EUR/BRL | NOT TESTED — credential absent | — | 200 · 5,8861 · intradiário | PTAX + ECB | PTAX × ECB | VERIFIED / independent_crosscheck |
| BTC/USD | NOT TESTED — credential absent | — | 200 · 84.228,94 | Coinbase, Kraken, Bitstamp, Gemini | Exchanges | VERIFIED / independent_crosscheck |
| Treasury 10Y | — | — | — | US Treasury (+ FRED DGS10) | US Treasury | VERIFIED / official_single |
| DXY | fora do catálogo | NOT TESTED — credential absent | 200 · 101,176 | — | Proxy ECB | UNVERIFIED / proxy |
| Euro Stoxx 50 / DAX / FTSE | NOT TESTED — credential absent (catálogo ✔) | — | 200 (intradiário) | — | — | UNAVAILABLE |
| Nikkei | NOT TESTED — credential absent (catálogo ✔) | — | 200 · 66.753,72 | FRED NIKKEI225 | FRED | UNVERIFIED / single_source |
| Hang Seng / Shanghai | NOT TESTED — credential absent (catálogo ✔) | — | 200 | — | — | UNAVAILABLE |
| KOSPI | NOT TESTED — credential absent (catálogo ✔) | — | 200 · 6.838,04 (30/09) | BOK ECOS (29/09) | BOK | UNVERIFIED / single_source |

O Yahoo nunca entra na verificação e fica desligado por padrão. Os valores do Yahoo acima são intradiários de 30/09, por isso não são comparáveis com os fechamentos de 29/09. JSON bruto em `provider-bakeoff-2026-09-30.json`.

## 13. Dashboard (`screenshots/`, `screenshots/report.json`)
Overview, Mercados, Curvas, Intelligence, Conteúdo, Agenda, Histórico, Admin e proveniência (DI 60M e IBOV), em desktop 1440 e mobile 390. Overflow horizontal: **0 px** em todas as páginas e viewports.

Correções desta rodada:
- overflow de 37 px no admin mobile;
- botão sobreposto ao título no admin mobile;
- **a proveniência agora mostra métrica, valor exato, período, data de referência, fonte, método, sessão e instrumento** (ex.: `BR_DI1_60M · 13,997 % a.a. · DI1V31 · venc. 2031-10-01 · 1252 du`);
- DI com 3 casas decimais na tabela (a B3 publica 3; antes aparecia "14,00%").

## Avisos (permitidos, nenhum escondido)
- Core 4/8: IBOV, S&P 500, Nasdaq e Dow em single_source, marcados UNVERIFIED.
- Mercados estendidos UNAVAILABLE (Euro Stoxx, DAX, FTSE, Hang Seng, Shanghai): dependem da chave do Twelve Data.
- DXY exibido como proxy (UNVERIFIED).
- CN CPI e CN LPR UNAVAILABLE. HICP da zona do euro defasado (série U2 termina em 2025-12), fora dos fatos citáveis.
- Providers opcionais sem chave (Twelve Data, FMP, BRAPI token, BOK).
- Sem Reuters/AP (licença). O classificador de notícias é heurístico (palavras-chave), então erros pontuais de tópico/região ainda são possíveis.

## Blockers
- **Software/dados (1–10, 12):** nenhum ativo. O 12 foi encontrado e corrigido nesta rodada (seção 7).
- **Produção:** não há deployment, então o 11 não se aplica. **A produção fica bloqueada por ação humana** (seção 10).

## Reproduzir
```bash
export MI_STORAGE=file MI_DATA_DIR=/tmp/mi-r4 MI_LLM_PROVIDER=claude_code
npm run mi -- morning --bundle docs/mvp-run-r4/bundle-2026-09-30.json --observations docs/mvp-run-r4/brapi-mcp-observations-2026-09-30.json --mode claude_code --offline
npm run mi -- packet --date 2026-09-30      # os fact_ids mudam a cada run: remapeie a análise por métrica
npm run mi -- submit --date 2026-09-30 --file docs/mvp-run-r4/analysis-2026-09-30.json
npm run mi -- audit --date 2026-09-30
```
