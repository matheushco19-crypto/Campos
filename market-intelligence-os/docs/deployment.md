# Deploy

## Estado atual (criado nesta sessão)
| Recurso | Status |
|---|---|
| Supabase `market-intelligence-os` (org Matheus Campos, `sa-east-1`) | Criado. Migration aplicada. RLS travado (advisor: só o INFO esperado "RLS enabled, no policy") |
| URL do banco | `https://hourclrikooygkrinjoc.supabase.co` |
| Vercel `market-intelligence-os` (`prj_dfcJGJzqCdQF6lEJ3HQAqCJ4Im4D`, Root Directory `market-intelligence-os`) | Criado. Env vars `SUPABASE_URL`, `MI_STORAGE=supabase`, `MI_LLM_PROVIDER=claude_code` definidas |
| Projeto WealthOS (Supabase e Vercel) | **Intocado** |

## Passos que dependem de você (segredos e conexão Git)
1. **Vercel → Settings → Git:** conectar o repositório `matheushco19-crypto/Campos` (Root Directory já é `market-intelligence-os`).
2. **Vercel → Settings → Environment Variables** (tipo Sensitive):
   - `SUPABASE_SERVICE_ROLE_KEY`, copiada de Supabase → Project Settings → API (projeto *market-intelligence-os*);
   - `CRON_SECRET`, uma string aleatória longa (`openssl rand -hex 32`);
   - `DASHBOARD_PASSWORD`, a senha do dashboard;
   - recomendada (gratuita): `BRAPI_TOKEN`, que liga o Ibovespa no backend (brapi.dev → cadastro gratuito);
   - opcionais gratuitas: `BOK_ECOS_KEY` (KOSPI), `TWELVEDATA_API_KEY`, `FRED_API_KEY`, `COINGECKO_DEMO_KEY`;
   - opcional paga: `ANTHROPIC_API_KEY` (e aí `MI_LLM_PROVIDER=anthropic_api`).
3. Fazer deploy (push para a branch de produção). Os crons do `vercel.json` passam a rodar sozinhos.
4. (Opcional) Importar o histórico do primeiro teste: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run mi -- sync --from data` numa máquina que tenha rodado o pipeline local, ou reproduzir com o bundle em `docs/first-run/`.
5. Ativar a rotina do Claude Code (veja [automation.md](automation.md)).

## Variáveis de ambiente
Veja `.env.example` (todas documentadas). Nenhum segredo fica no código ou no frontend: todo segredo é lido só em `src/core/env.ts` (servidor), sem prefixo `NEXT_PUBLIC_`.

## Segurança
- A service role é usada só no servidor. RLS sem policies bloqueia a chave anon.
- Os endpoints de máquina exigem Bearer `CRON_SECRET` (comparação em tempo constante).
- Dashboard com Basic Auth (`DASHBOARD_PASSWORD`). `POST /api/run` com checagem de origem, lock e intervalo mínimo de 2 minutos.
- Todo input externo é validado com Zod. Conteúdo de feeds é tratado como texto não confiável (tags e scripts removidos, nada é executado).
- HTTP com timeout, retry com backoff exponencial, limite de tamanho de resposta e concorrência limitada por fonte.
- As URLs persistidas passam por `redactUrl` (tokens nunca vão para o banco).

## CI
`.github/workflows/market-intelligence-os.yml`: typecheck → Vitest → build → Playwright, disparado só quando `market-intelligence-os/**` muda.
