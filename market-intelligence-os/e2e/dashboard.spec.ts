import { expect, test } from '@playwright/test'

test.describe('Market Intelligence OS — MVP daily flow', () => {
  test('overview answers the 30-second questions', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await expect(page.getByText('MARKET INTELLIGENCE', { exact: false }).first()).toBeVisible()
    // 1. what day
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Terça-feira')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('29 de setembro de 2026')
    const overview = page.locator('#overview')
    // 2. what happened · 4. what matters
    await expect(overview.getByText('O que aconteceu', { exact: true })).toBeVisible()
    await expect(overview.getByRole('heading', { name: 'O que importa hoje' })).toBeVisible()
    // 3. markets · 5. wealth · 6. publish · 7. today · 8. yesterday
    const aside = page.getByRole('complementary', { name: 'Resumo do dia' })
    for (const k of ['Mercados', 'Para o patrimônio', 'Para publicar', 'Hoje', 'Ontem · 28 SET 2026']) await expect(aside.getByText(k, { exact: true })).toBeVisible()
  })

  test('overview: compact markets (no Treasury), intelligence, UHNW, content lab and the Sunday–Saturday agenda', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    const aside = page.getByRole('complementary', { name: 'Resumo do dia' })
    await expect(aside).toContainText('S&P 500')
    await expect(aside).not.toContainText('Treasury 10Y')
    await expect(aside.getByRole('link', { name: 'Tabela completa' })).toHaveAttribute('href', '/mercados')
    // Removed from the overview: full markets section, coverage block and embedded history.
    await expect(page.locator('#markets')).toHaveCount(0)
    await expect(page.locator('#history')).toHaveCount(0)
    await expect(page.locator('#overview')).not.toContainText('Cobertura mínima')
    const intel = page.locator('#intelligence')
    for (const k of ['O que aconteceu', 'Por que aconteceu', 'O que isso muda']) await expect(intel.getByText(k).first()).toBeVisible()
    await expect(intel).toContainText('duration')
    await expect(page.locator('#uhnw')).toContainText('não é recomendação individualizada', { ignoreCase: true })
    const content = page.locator('#content')
    for (const k of ['Story', 'Carrossel', 'Post', 'Reel · roteiro', 'Fechamento', 'CTA']) await expect(content.getByText(k, { exact: true }).first()).toBeVisible()
    await expect(content.getByText(/^Hook/).first()).toBeVisible()
    await expect(content).toContainText('O preço do tempo')
    // Social Strategy and Performance are hidden from the UI (backend kept).
    await expect(content).not.toContainText('Social Strategy')
    await expect(content).not.toContainText('Performance')
    await expect(content).not.toContainText('Dados de performance ainda não importados.')
    // Agenda: one horizontal week, 7 columns, Sunday → Saturday.
    const cal = page.locator('#calendar')
    await expect(cal.getByTestId('agenda-day')).toHaveCount(7)
    const days = await cal.getByTestId('agenda-day').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
    expect(new Set(days.map(Math.round)).size).toBe(1)
    for (const k of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) await expect(cal.getByText(k, { exact: true })).toBeVisible()
  })

  test('section hierarchy 01–05, UHNW as its own section and sources collapsed', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    const expected: [string, string][] = [['#overview', '01'], ['#intelligence', '02'], ['#uhnw', '03'], ['#content', '04'], ['#calendar', '05']]
    for (const [id, n] of expected) await expect(page.locator(id)).toContainText(n)
    const tops = await Promise.all(expected.map(([id]) => page.locator(id).evaluate((e) => e.getBoundingClientRect().top)))
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    const sources = page.getByTestId('sources')
    await expect(sources).not.toHaveAttribute('open', /.*/)
    await expect(sources.locator('summary')).toContainText(/Fontes e metodologia · \d+/)
    const box = await sources.boundingBox()
    expect(box!.height).toBeLessThan(60)
    await sources.locator('summary').click()
    await expect(sources).toHaveAttribute('open', '')
    await expect(sources.getByRole('link').first()).toBeVisible()
  })

  test('/mercados: full table with Treasury, core count and rate curves', async ({ page }) => {
    await page.goto('/mercados?date=2026-09-29')
    await expect(page.locator('#markets table').first()).toContainText('S&P 500')
    await expect(page.locator('#markets table').first()).toContainText('Treasury 10Y')
    await expect(page.locator('#markets')).toContainText('Core Markets Verified:')
    const rates = page.locator('#rates')
    await expect(rates.getByRole('heading', { name: 'Curvas de Juros' })).toBeVisible()
    await expect(rates).toContainText('US Treasury')
    await expect(rates).toContainText('2s10s')
    await expect(rates).toContainText('37 bps')
  })

  test('provenance shows metric, value, period, sources, reference date, collection time, method and confidence', async ({ page }) => {
    await page.goto('/mercados?date=2026-09-29')
    await page.locator('#markets table').first().getByRole('button', { name: /VERIFIED/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Proveniência do dado' })
    await expect(dialog).toBeVisible()
    for (const k of ['Métrica', 'Valor', 'Período', 'Fonte primária', 'Fonte secundária', 'Data de referência', 'Coletado em', 'Confiança', 'Método', 'VERIFIED', 'Links']) await expect(dialog).toContainText(k)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('history: previous/next dates on the brief, versions and comparison on /historico', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await page.getByRole('button', { name: /Data anterior/ }).click()
    await expect(page).toHaveURL(/date=2026-09-28/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('28 de setembro')
    await page.getByRole('button', { name: /Data seguinte/ }).click()
    await expect(page).toHaveURL(/date=2026-09-29/)
    // Append-only: both versions of 29/09 are listed on the history page; compare them there.
    await page.goto('/historico?date=2026-09-29')
    const history = page.locator('#history')
    await expect(history.getByText('v1', { exact: true })).toBeVisible()
    await expect(history.getByText('v2', { exact: true })).toBeVisible()
    await history.getByRole('link', { name: /comparar/ }).first().click()
    await expect(page).toHaveURL(/\/historico\?.*cv=1/)
    await expect(page.locator('#history')).toContainText('Somente fatos → Claude Code')
  })

  test('admin explains the state of the brief', async ({ page }) => {
    await page.goto('/admin?date=2026-09-29')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Briefing publicado (v2)')
    for (const k of ['Agent 1', 'Agent 2', 'Agent 3', 'Último snapshot publicado', 'Fontes indisponíveis na última coleta']) await expect(page.getByText(k, { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /SYSTEM HEALTH: (HEALTHY|DEGRADED|FAILED)/ })).toBeVisible()
    await expect(page.getByText(/Core Markets Verified: \d\/8/).first()).toBeVisible()
    await page.goto('/admin?date=2026-09-01')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nenhuma execução registrada')
  })

  test('empty date shows a clear state instead of inventing content', async ({ page }) => {
    await page.goto('/?date=2026-09-01')
    await expect(page.getByRole('heading', { name: /Nenhum briefing para 01 SET 2026/ })).toBeVisible()
    await expect(page.getByText('Nenhuma execução registrada para esta data.')).toBeVisible()
  })

  test('no horizontal scroll on the page', async ({ page }) => {
    for (const url of ['/?date=2026-09-29', '/admin?date=2026-09-29']) {
      await page.goto(url)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, url).toBeLessThanOrEqual(1)
    }
  })
})
