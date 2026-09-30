# Agent 2: Financial Intelligence + CFP/CFA Analyst + Copywriter

## Entrada: o analysis packet
`src/agents/financial-intelligence/packet.ts`. Contexto mínimo, sem páginas e sem banco inteiro:
- `citable_facts`: só `VERIFIED` e não defasados (id, rótulo, valor, variação, anterior, referência, status, fonte);
- `non_citable`: o que falta (UNVERIFIED/CONFLICT/UNAVAILABLE/defasado), para o modelo não improvisar;
- `clusters`: até 14 eventos, no máximo 3 por tema, com fontes e resumo curto;
- `agenda` e `event_driven_requests` (eventos HIGH em até 2 dias, vindos do Agent 3).

## Saída: `AnalysisOutput` (Zod)
`what_matters` (5 a 7) · `macro_watch` {BR, US, CN, EU} · `insights` (3: o que aconteceu / por que / o que muda) · `uhnw_lens` (2 a 3) · `content_lab` (exatamente story, carrossel, reel e take, + `exceptional` opcional).
Cada item traz `fact_ids` e `cluster_ids`. As tabelas (mercados, macro), a agenda e as fontes são montadas **por código**, nunca pelo LLM.

## Framework analítico
Codificado nas instruções (`instructions.ts`): FATO → CONTEXTO → MECANISMO → IMPLICAÇÃO → OPINIÃO. Valuation, taxa de desconto, prêmio de risco, duration, curva, crédito, liquidez, câmbio, correlações, efeitos de 2ª e 3ª ordem. Lentes de portfólio (SAA/TAA, concentração, sequence risk, behavioral risk) e patrimoniais (sucessão, tributação, proteção, internacionalização, famílias empresárias). Temas legais separam fato legal, interpretação econômica e impacto patrimonial, sem aconselhamento categórico.

**UHNW Lens:** "O que isso muda numa conversa com um cliente de patrimônio elevado?" Nunca presume dados de cliente nem faz recomendação personalizada.

**Política:** factual, alegações atribuídas, sem propaganda, recomendação de voto, ranking ou previsão eleitoral.

## Morning Brief
Limite absoluto de 10 minutos (meta de 8), cerca de 900 a 1.200 palavras. Estrutura no dashboard: O que importa hoje → Mercados em 60 segundos → Macro Watch → Intelligence Take → UHNW Lens → Content Lab → Agenda → Fontes.

## Content Lab
CONTEXTO + TENSÃO + INSIGHT, a partir de acontecimentos reais. O QC rejeita títulos genéricos ("5 dicas", "3 coisas que você precisa saber", "Entenda a..."). Exemplo do primeiro run: IPCA em queda e IGP-M em alta viram o story "A inflação caiu. E subiu. No mesmo mês."

## Como alterar o perfil editorial
Edite `config/editorial-profile.ts`:
- `context`, `positioning`, `voice`, `never`: entram no system prompt;
- `bannedPhrases`: bloqueadas pelo QC (e pedidas ao modelo);
- `inventedExperiencePatterns`: regex de experiências inventadas;
- `briefLimits`: palavras e tempo de leitura;
- `forbiddenContentPatterns`: formatos genéricos proibidos.
O system prompt é texto congelado (sem datas), então continua cacheável.

## Modelos
`MI_MODEL_DEEP` (padrão `claude-opus-5-5`) para o brief e a estratégia semanal, `MI_MODEL_FAST` (padrão `claude-haiku-4-5`) para tarefas leves. Uma única chamada por dia no modo API, com cache do system prompt. Resposta `refusal`/`max_tokens` → fallback determinístico, registrado em `agent_runs`.

## Modo Claude Code (Claude Pro, sem API key)
1. O pipeline das 05:00 grava o pacote (`analysis_packets`, status `PENDING`) e o snapshot `AWAITING_ANALYSIS`.
2. A rotina do Claude Code executa `GET /api/analysis` (Bearer `CRON_SECRET`), recebendo instruções + JSON Schema + pacote.
3. Escreve a análise e executa `POST /api/analysis` com `{date, analysis}`.
4. O servidor valida (Zod), roda o QC, publica a nova versão (`PUBLISHED`) e marca o pacote `SUBMITTED`.
Localmente: `npm run mi -- packet` / `npm run mi -- submit --file`.
