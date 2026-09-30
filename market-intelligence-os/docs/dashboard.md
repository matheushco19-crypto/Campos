# Dashboard

Somente dashboard no MVP: sem e-mail, notificações, WhatsApp, Telegram ou Slack. Terminal pessoal: Manrope, navy quase preto no topo, azul como acento, branco, cinza e preto, alto contraste, claro e escuro.

## Topo
Marca · navegação por data (← anterior, date picker com as datas disponíveis, → seguinte, "Hoje", setas do teclado) · seletor de versão · tema · link para `/admin`. Abaixo, a **faixa de mercados** (IBOV, USD/BRL, EUR/BRL, S&P 500, Nasdaq, Dow, UST 10Y, DXY, Nikkei, Kospi, BTC), com ponto de cor pelo status de verificação (também em texto para leitores de tela). A navegação fica fixa e tem seis seções.

## Seções
| Seção | Responde |
|---|---|
| **Overview** | As 8 perguntas dos 30 segundos: que dia é hoje (título), o que aconteceu (lede), como estão os mercados (painel + faixa), o que importa (5–7 acontecimentos), o que isso significa para patrimônio, o que publicar, o que acontece hoje e o que aconteceu ontem. Todos os eventos deduplicados ficam num expansível. |
| Mercados | Tabela completa com filtro por região, sparkline de 30 dias, referência, status e selo; comparação com outra data; desempenho relativo base 100; Macro BR/EUA/Europa/China com o Macro Watch |
| Intelligence | 3 insights em três colunas (o que aconteceu · fato → por que aconteceu · mecanismo → o que isso muda · leitura), com as lentes usadas; UHNW Lens com tema e o aviso de que não é recomendação individualizada |
| Conteúdo | Story, Carrossel e Take (título, ângulo, ideia principal) e Reel com roteiro (hook, desenvolvimento, fechamento, CTA). "O que produzir nos próximos 7 dias": evento → ângulo editorial → peças (formato · data ideal · status). Performance importada, ou "Dados de performance ainda não importados." |
| Agenda | Hoje, Amanhã, Esta semana e Próximos eventos. Cada evento: data, hora em Brasília (com o horário original quando é de outro fuso), região, importância, fonte e oportunidade editorial. Calendário completo de 45 dias num expansível |
| Histórico | Busca em todos os briefings, dias com conteúdo, versões da data (append-only) e comparação entre duas versões (status, QC, palavras, acontecimentos incluídos/removidos, dados que mudaram) |
| Fontes | Referências do briefing agrupadas (dados, notícias, agenda) |

Sem versão explícita na URL, o dashboard mostra a **última versão publicada** (aprovada no QC) e avisa quando existe uma versão mais nova que não foi publicada. Parâmetros: `?date=AAAA-MM-DD`, `&v=N` (versão), `&compare=AAAA-MM-DD` (mercados), `&cv=N` (comparar versões).

## Proveniência
Todo dado tem selo VERIFIED / UNVERIFIED / CONFLICT / UNAVAILABLE / REJECTED, com ícone e rótulo (nunca só cor). Ao clicar, sempre os mesmos campos: status com explicação, fonte primária, fonte secundária, data de referência, válido em, coletado em, confiança e links. No celular, abre como painel inferior. Notícias mostram as fontes e o horário de publicação; eventos, a fonte oficial e a data.

## Administração (`/admin`)
Responde "por que o briefing de hoje não apareceu?" automaticamente (`src/engines/diagnosis.ts`): publicado, aguardando a etapa de interpretação, reprovado no QC (com as checagens), só fatos, pipeline sem snapshot, agendado ou sem execução. Mostra também a última execução de cada agente (status, duração, erros), o último snapshot publicado, as versões da data, o QC da última versão, as fontes indisponíveis e as puladas, os dados sem verificação, as execuções da data, o Research Broker e o botão "Rodar agora". Aceita `?date=`.

## Arquivos
`src/app/page.tsx` · `src/components/brief/*` (Overview, Markets, Intelligence, Content, Agenda, History, Sources) · `src/components/{MarketTape,DateNav,SectionNav,VerificationBadge,MarketsTable,NewsList,CompareChart,Sparkline}.tsx` · `src/lib/{dashboard-data,admin-data,version-diff,agenda,provenance}.ts` · `src/app/admin/page.tsx`.
Proteção: `DASHBOARD_PASSWORD` ativa Basic Auth (`src/proxy.ts`), inclusive em `/admin`.
