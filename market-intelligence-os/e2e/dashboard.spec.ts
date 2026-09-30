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

  test('markets, intelligence, UHNW, content lab and agenda', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await expect(page.locator('#markets table')).toContainText('S&P 500')
    const intel = page.locator('#intelligence')
    for (const k of ['O que aconteceu', 'Por que aconteceu', 'O que isso muda']) await expect(intel.getByText(k).first()).toBeVisible()
    await expect(intel).toContainText('duration')
    await expect(page.locator('#uhnw')).toContainText('não é recomendação individualizada', { ignoreCase: true })
    const content = page.locator('#content')
    for (const k of ['Story', 'Carrossel', 'Take', 'Reel · roteiro', 'Hook', 'Desenvolvimento', 'Fechamento', 'CTA']) await expect(content.getByText(k, { exact: true }).first()).toBeVisible()
    await expect(content).toContainText('O preço do tempo')
    await expect(content).toContainText('Dados de performance ainda não importados.')
    const cal = page.locator('#calendar')
    for (const k of ['Hoje', 'Amanhã', 'Esta semana', 'Próximos eventos']) await expect(cal.getByRole('heading', { name: k })).toBeVisible()
    await expect(cal).toContainText('Eleições gerais')
  })

  test('provenance shows sources, reference date, collection time, status and confidence', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await page.locator('#markets table').getByRole('button', { name: /VERIFIED/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Proveniência do dado' })
    await expect(dialog).toBeVisible()
    for (const k of ['Fonte primária', 'Fonte secundária', 'Data de referência', 'Coletado em', 'Confiança', 'VERIFIED', 'Links']) await expect(dialog).toContainText(k)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('history: previous/next dates, versions and version comparison', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await page.getByRole('button', { name: /Data anterior/ }).click()
    await expect(page).toHaveURL(/date=2026-09-28/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('28 de setembro')
    await page.getByRole('button', { name: /Data seguinte/ }).click()
    await expect(page).toHaveURL(/date=2026-09-29/)
    // Append-only: both versions of 29/09 are listed; compare them.
    const history = page.locator('#history')
    await expect(history.getByText('v1', { exact: true })).toBeVisible()
    await expect(history.getByText('v2', { exact: true })).toBeVisible()
    await history.getByRole('link', { name: /comparar/ }).first().click()
    await expect(page).toHaveURL(/cv=1/)
    await expect(history).toContainText('Aguardando análise → Publicado')
  })

  test('admin explains the state of the brief', async ({ page }) => {
    await page.goto('/admin?date=2026-09-29')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Briefing publicado (v2)')
    for (const k of ['Agent 1', 'Agent 2', 'Agent 3', 'Último snapshot publicado', 'Fontes indisponíveis na última coleta']) await expect(page.getByText(k, { exact: false }).first()).toBeVisible()
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
