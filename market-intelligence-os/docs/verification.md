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

## Provenance (todo fato)
`id, category, metric, value, unit, reference_period, as_of, retrieved_at, primary_source, secondary_source, primary_url, secondary_url, verification_status, confidence, notes, created_at, updated_at`, mais `change_pct, previous_value, market_status, timezone, source_fallback, single_source, is_stale, brief_date, run_id`.

## Controle de qualidade do brief (12 checagens)
`src/engines/quality-control.ts`, rodado antes de salvar:
1. Todos os números têm fonte (**detecção de claims sem suporte**: extrai números em pt-BR e confere contra os fatos citados, incluindo variação, valor anterior, bps e escala "mil")
2. Fatos materiais são `VERIFIED` · 3. Nenhuma notícia duplicada · 4. Nenhum mercado aberto descrito como fechado · 5. Nenhum dado defasado como atual · 6. Insights separados dos fatos (com base citada, sem opinião no "o que aconteceu") · 7. Português · 8. Até 10 minutos de leitura (150 wpm) · 9. Content Lab curto e sem formatos genéricos ("5 dicas...") · 10. Agenda com fonte · 11. Sem linguagem genérica de IA (lista em `config/editorial-profile.ts`) · 12. Nenhuma experiência pessoal inventada.

**Correção antes de salvar:** remove as frases de preenchimento; remove itens com claim sem suporte ou fato não verificado; adiciona `fact_id` quando o número bate com exatamente um fato citável; deduplica eventos; substitui a ideia de conteúdo inválida por um aviso; encurta seções de menor prioridade até caber em 10 minutos. O relatório fica em `snapshot.qc`.

## Auditoria
`npm run mi -- audit --date D` confere o snapshot publicado de forma independente: as linhas de mercado batem com os fatos, as citações apontam só para fatos citáveis, a reexecução do QC é idempotente, as contagens por seção, o tempo de leitura e as falhas de fonte.
