#!/usr/bin/env node
/**
 * Claude Code Routine hand-off (Agent 2), no dependencies (Node 18+ fetch).
 *
 *   node scripts/routine.mjs get    [--date YYYY-MM-DD] [--out packet.json] [--force]
 *   node scripts/routine.mjs submit --file analysis.json [--date YYYY-MM-DD]
 *
 * Environment (never printed):
 *   MI_BASE_URL   production URL, e.g. https://<project>.vercel.app
 *   CRON_SECRET   same value as the Vercel env var; sent as "Authorization: Bearer …"
 *
 * Exit codes: 0 ok · 1 unexpected · 2 auth/config · 3 no packet · 4 rejected by QC/validation
 *             5 submission in progress (after one retry) · 10 already enriched (get without --force)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(`--${name}`)
const log = (...m) => console.error('[routine]', ...m)
const die = (code, msg) => {
  log(msg)
  process.exit(code)
}

const base = (process.env.MI_BASE_URL ?? '').replace(/\/+$/, '')
const secret = process.env.CRON_SECRET ?? ''
if (!/^https?:\/\//.test(base)) die(2, 'MI_BASE_URL ausente ou inválida (ex.: https://<projeto>.vercel.app).')
if (!secret) die(2, 'CRON_SECRET ausente no ambiente da rotina.')

const todayBrt = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const date = flag('date') ?? todayBrt()
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(2, `data inválida: ${date}`)

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // Non-JSON (e.g. a platform error page): reported below, never treated as success.
  }
  return { status: res.status, json, text }
}

const explain = (r) => (r.json?.error ? String(r.json.error) : r.text.slice(0, 300))

async function get() {
  const r = await call('GET', `/api/analysis?date=${date}`)
  if (r.status === 401) die(2, 'HTTP 401: CRON_SECRET não confere com o da Vercel.')
  if (r.status === 503) die(2, `HTTP 503: ${explain(r)}`)
  if (r.status === 404) die(3, `HTTP 404: nenhum pacote para ${date}. O cron da manhã já rodou? (${explain(r)})`)
  if (r.status !== 200 || !r.json?.packet) die(1, `HTTP ${r.status}: resposta inesperada: ${explain(r)}`)
  const b = r.json.packet.budget ?? {}
  log(`pacote ${date}: status ${r.json.status}, ${b.chars ?? '?'} caracteres (~${b.estimated_tokens ?? '?'} tokens), ${r.json.packet.citable_facts?.length ?? 0} fatos, ${r.json.packet.clusters?.length ?? 0} clusters`)
  const out = flag('out') ?? 'packet.json'
  writeFileSync(out, JSON.stringify(r.json, null, 2))
  log(`gravado em ${out} (instruções + schema + pacote)`)
  if (r.json.status === 'SUBMITTED' && !has('force')) die(10, 'A análise de hoje já foi publicada. Nada a fazer (use --force para reenviar).')
}

async function submit() {
  const file = flag('file')
  if (!file) die(2, 'use: submit --file analysis.json')
  let analysis
  try {
    analysis = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    die(4, `JSON inválido em ${file}: ${e.message}`)
  }
  let r = await call('POST', '/api/analysis', { date, analysis })
  if (r.status === 409) {
    log('HTTP 409: outra submissão em andamento; nova tentativa em 20 s.')
    await new Promise((ok) => setTimeout(ok, 20_000))
    r = await call('POST', '/api/analysis', { date, analysis })
    if (r.status === 409) die(5, `HTTP 409 de novo: ${explain(r)}`)
  }
  if (r.status === 401) die(2, 'HTTP 401: CRON_SECRET não confere com o da Vercel.')
  if (r.status === 400 || r.status === 422) die(4, `HTTP ${r.status}: análise rejeitada. Corrija e reenvie:\n${explain(r)}`)
  if (r.status !== 200) die(1, `HTTP ${r.status}: ${explain(r)}`)
  if (r.json?.status !== 'PUBLISHED') die(4, `Resposta sem publicação (status ${r.json?.status ?? '?'}): ${r.text.slice(0, 300)}`)
  const qc = r.json.qc ?? {}
  log(`publicado: ${r.json.snapshot} · QC ${qc.passed ? 'aprovado' : 'com avisos'} · ${qc.word_count ?? '?'} palavras · ${(qc.corrections ?? []).length} correções automáticas`)
  // Confirmation: the packet must now be SUBMITTED.
  const check = await call('GET', `/api/analysis?date=${date}`)
  if (check.status === 200 && check.json?.status === 'SUBMITTED') log('confirmado: pacote marcado como SUBMITTED.')
  else log(`aviso: confirmação inconclusiva (HTTP ${check.status}, status ${check.json?.status ?? '?'}).`)
  console.log(JSON.stringify({ snapshot: r.json.snapshot, status: r.json.status }))
}

try {
  if (cmd === 'get') await get()
  else if (cmd === 'submit') await submit()
  else die(2, 'comandos: get | submit')
} catch (e) {
  die(1, `falha de rede ou timeout: ${e instanceof Error ? e.message : String(e)}`)
}
