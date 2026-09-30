# Rotina do Claude Code (Agent 2)

A interpretação diária é escrita por uma **rotina do Claude Code** (assinatura Claude, sem API paga de LLM dentro da aplicação). O app nunca chama um LLM no fluxo diário: ele entrega um pacote pronto e valida o que volta.

```
05:00–05:59 BRT  Vercel Cron → /api/cron/morning-intelligence
                 Agent 1 (coleta) → Agent 3 (agenda) → snapshot v1 PUBLISHED (determinístico)
                 analysis_packets[data] = PENDING
06:15 BRT        Rotina do Claude Code
                 GET  /api/analysis        (Authorization: Bearer $CRON_SECRET) → instruções + JSON Schema + pacote
                 escreve analysis.json     (somente o JSON do schema)
                 POST /api/analysis        (mesmo header) → Zod → Metric Alignment → QC
                 snapshot v2 PUBLISHED     (append-only; v1 é preservada) e pacote = SUBMITTED
Dashboard        mostra a última versão PUBLISHED da data (v2 substitui v1 na exibição)
```

## Autenticação
`GET` e `POST /api/analysis` usam a mesma função (`authorizeMachine`, `src/lib/auth.ts`): o header precisa ser exatamente `Authorization: Bearer <CRON_SECRET>`, comparado em tempo constante. Sem o header ou com valor errado a resposta é **401**. Sem `CRON_SECRET` configurado na Vercel, **503**. O segredo só existe no servidor (`process.env.CRON_SECRET`); não vai para o bundle do navegador, para logs nem para o banco.

Um 401 em `GET /api/analysis` significa quase sempre que a chamada saiu **sem o header** ou com um valor diferente do cadastrado na Vercel.

## Configuração externa (uma vez)
Nada disso pode ser feito pelo repositório; é configuração do ambiente da rotina:

1. **Variáveis de ambiente da rotina** (menu do ambiente de nuvem → Edit → variáveis de ambiente):
   - `MI_BASE_URL` = URL de produção, por exemplo `https://market-intelligence-os-five.vercel.app`
   - `CRON_SECRET` = **o mesmo valor** de `CRON_SECRET` na Vercel (Production). Se não tiver o valor, gere um novo, atualize nos dois lugares e faça redeploy na Vercel.
2. **Rede:** o domínio de produção (`*.vercel.app` ou o domínio exato) precisa estar liberado na política de rede do ambiente da rotina. Sem isso a chamada nem chega ao app (erro de rede, não 401).
3. **Agendamento:** diário às 06:15 BRT (`CRON_TZ=America/Sao_Paulo 15 6 * * *`), sessão nova a cada disparo, repositório `matheushco19-crypto/Campos`.

Nunca cole o valor do segredo em chat, código, commit ou documento.

## Prompt da rotina
> Você é o Agent 2 do Market Intelligence OS. No diretório `market-intelligence-os`:
> 1. Rode `node scripts/routine.mjs get --out packet.json`. Exit 10 = a análise de hoje já foi publicada: encerre sem fazer nada. Exit 2 = autenticação/configuração, exit 3 = sem pacote (o cron ainda não rodou): encerre e relate o erro. Qualquer outro código diferente de 0: relate e encerre.
> 2. Leia `packet.json`: siga `instructions` à risca e produza **somente** o JSON que valida contra `output_schema`, usando apenas os fatos e clusters de `packet`. Todo número precisa de `fact_id` de um fato citável; notícia de fonte única começa atribuída ("Segundo o Valor, ..."); não invente causalidade.
> 3. Salve em `analysis.json` e rode `node scripts/routine.mjs submit --file analysis.json`.
> 4. Exit 0 = publicado (o script confirma o status PUBLISHED e o pacote SUBMITTED). Exit 4 = rejeitado pelo QC/validação: leia os motivos, corrija só o que foi apontado e reenvie **uma** vez. Se falhar de novo, encerre e relate. 401, 5xx ou erro de rede nunca são sucesso.
> Não altere código, não faça commits, não chame APIs pagas de LLM e não envie nada além do JSON da análise.

## Garantias do servidor
- **Validação:** JSON inválido ou sem `{ date, analysis }` → 400. Schema inválido, Metric Alignment ou QC bloqueante → 422 com os motivos; nada é publicado.
- **Append-only:** cada publicação é uma nova versão; nenhuma versão anterior é alterada.
- **Idempotência:** a mesma análise reenviada devolve a versão já publicada (`analysis_hash`), sem criar outra.
- **Concorrência:** duas submissões simultâneas da mesma data: uma é processada e a outra recebe 409 (lease `ANALYSIS_SUBMIT`). O script tenta de novo uma vez após 20 s.
- **Custo:** o pacote tem ~24k caracteres (~6k tokens); a watchlist e a cauda de notícias não entram.

## Diagnóstico rápido
| Sintoma | Causa provável |
|---|---|
| `GET /api/analysis` → 401 | header ausente ou `CRON_SECRET` da rotina diferente do da Vercel |
| → 503 `CRON_SECRET not configured` | variável ausente na Vercel (Production) ou deploy anterior ao cadastro |
| → 404 `no packet` | o cron da manhã ainda não rodou para a data (ou rodou em outra data BRT) |
| erro de rede / timeout | domínio de produção não liberado na política de rede da rotina |
| `POST` → 422 | QC/Metric Alignment rejeitou; a resposta lista cada motivo |
| Intelligence mostra "aguardando a rotina" | pacote PENDING: a rotina ainda não publicou a v2 |
