# Smoke test LOCAL em modo produção (NÃO é produção)

Executado em 30/09/2026 no container, com `next start` (NODE_ENV=production) e `VERCEL=1` para ativar as regras de produção. CRON_SECRET e DASHBOARD_PASSWORD eram valores de teste locais gerados na hora, nunca usados fora do container. Store em arquivo (cópia do run real de 30/09).

**Smoke test de produção: NOT TESTED**. Não existe deployment na Vercel (0 deployments) e o env de lá não tem as variáveis obrigatórias (ver README).

```
## A) VERCEL=1, CRON_SECRET + DASHBOARD_PASSWORD definidos (valores de teste locais)
GET / sem auth → 401
GET / basic auth errada → 401
GET / basic auth correta → 200
GET /admin basic auth correta → 200
GET /api/run sem auth → 401
GET /api/health → 200 {"ok": true, "storage": "file", "llm": "claude_code", "missing_required_env": []}
GET /api/cron/morning-intelligence sem bearer → 401
GET /api/cron/morning-intelligence bearer errado → 401
GET /api/analysis sem bearer → 401
GET /api/analysis bearer correto → 200 {'date': '2026-09-30', 'status': 'SUBMITTED'} packet chars 23825
POST /api/analysis (análise idêntica, bearer correto) → 200 {'snapshot': 'snap_2026-09-30_v2', 'status': 'PUBLISHED', 'qc_passed': None, 'error': None}
HTML de / contém segredo? 0 ocorrências

## B) VERCEL=1 sem DASHBOARD_PASSWORD e sem CRON_SECRET (fail-closed)
GET / → 503
GET /api/cron/morning-intelligence → 503
GET /api/analysis → 503
GET /api/health → {"ok": false, "storage": "file", "llm": "claude_code", "missing_required_env": ["CRON_SECRET", "DASHBOARD_PASSWORD"]}

## C) VERCEL=1, MI_STORAGE=supabase sem SUPABASE_SERVICE_ROLE_KEY (espelha o env atual da Vercel)
GET /api/health → 200 {"ok": false, "storage": "supabase", "llm": "claude_code", "missing_required_env": ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "DASHBOARD_PASSWORD"]}

## D) /api/health após a mudança (503 enquanto faltar variável obrigatória)
env igual ao da Vercel hoje → HTTP 503
todas as obrigatórias definidas → HTTP 200
```

Não executado: GET /api/cron/morning-intelligence com bearer correto. Isso dispararia uma coleta ao vivo, e a rede do container bloqueia as fontes. A coleta ao vivo foi validada no Vercel Sandbox (bundle-2026-09-30.json).
