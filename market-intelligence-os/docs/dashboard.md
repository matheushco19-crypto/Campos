# Dashboard

Somente dashboard no MVP: sem e-mail, notificações, WhatsApp, Telegram ou Slack.

## Topo
`MARKET INTELLIGENCE OS` · data (`29 SET 2026`) · horário de atualização (`20:47 BRT`) · status do brief · ← data anterior / → data seguinte (também pelas setas do teclado) · date picker (as datas com conteúdo aparecem como sugestões) · seletor de versão · tema claro/escuro.

## Seções (uma página, navegação por âncoras com scrollspy)
| Seção | Responde |
|---|---|
| Overview | O que importa hoje (5–7), Mercados em 60 segundos, Hoje, Para publicar, Ontem |
| Markets | Tabela com filtro por região, variação, sparkline de 30 dias, referência, status (em negociação/fechado/pré-abertura), badge de verificação, comparação com outra data e gráfico indexado (base 100) |
| Macro | BR/EUA/China/Europa, com valores verificados e Macro Watch |
| News | Eventos deduplicados, filtro por tema, expansão com todas as fontes |
| Intelligence | 3 insights (fato → mecanismo → leitura) com os fatos citados |
| UHNW | 2–3 pontos |
| Content | Story, Carrossel, Reel, Take e oportunidades antecipadas |
| Calendar | Hoje, amanhã, próximos e calendário completo de 45 dias |
| Fontes | Referências com links |
| Research | Research Broker (formulário), execuções (`agent_runs`), erros por fonte, QC, "Rodar agora" |
| History | Busca histórica em todos os briefings, dias com conteúdo e revisão semanal do Agent 3 |

Critério dos 30 segundos: dia, o que aconteceu, mercados, o que importa, impacto patrimonial, o que publicar, agenda de hoje e "ontem", tudo no Overview.

## Verification UX
Todo dado tem badge VERIFIED / UNVERIFIED / CONFLICT / UNAVAILABLE / REJECTED, com ícone e rótulo (nunca só cor). Ao clicar, abre a fonte primária, a secundária, a referência, o as_of, o horário de coleta, os links, a confiança, a nota, `source_fallback` e a defasagem. Valores em CONFLICT aparecem riscados.

## Design
Manrope (self-hosted), navy/azul/branco/cinza/preto, tokens CSS com dark mode (preferência do sistema + toggle), `tabular-nums` nas tabelas, microinterações discretas, `prefers-reduced-motion` respeitado. Gráficos seguem o método de dataviz: sparkline de série única sem legenda, comparação com até 3 séries em eixo único e legenda, tooltips.

## Arquivos
`src/app/page.tsx` (server component), `src/lib/dashboard-data.ts` (carregamento), `src/components/*` (DateNav, SectionNav, VerificationBadge, MarketsTable, Sparkline, CompareChart, NewsList, ResearchPanel, HistorySearch).
Proteção: `DASHBOARD_PASSWORD` ativa Basic Auth (`src/proxy.ts`).
