import { expect, test } from '@playwright/test'

test.describe('Market Intelligence OS dashboard', () => {
  test('answers the 30-second questions for the latest brief', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await expect(page.getByText('MARKET INTELLIGENCE OS', { exact: true })).toBeVisible()
    await expect(page.getByText('29 SET 2026', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'O que importa hoje' })).toBeVisible()
    await expect(page.getByText('Mercados em 60 segundos', { exact: true })).toBeVisible()
    await expect(page.locator('#content')).toContainText('O preço do tempo')
    await expect(page.locator('#uhnw')).toContainText('liquidez')
    await expect(page.locator('#calendar')).toContainText('Eleições gerais')
  })

  test('date navigation: previous day, next day and history are preserved', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    await page.getByRole('button', { name: /Data anterior/ }).click()
    await expect(page).toHaveURL(/date=2026-09-28/)
    await expect(page.getByText('28 SET 2026', { exact: true })).toBeVisible()
    await expect(page.getByText('Somente fatos').first()).toBeVisible()
    await page.getByRole('button', { name: /Data seguinte/ }).click()
    await expect(page).toHaveURL(/date=2026-09-29/)
    // Append-only history: 29/09 keeps both versions (awaiting analysis, then published).
    await expect(page.getByRole('combobox', { name: 'Versão do briefing' }).locator('option')).toHaveCount(2)
  })

  test('verification UX shows provenance on click', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    const badge = page.locator('#markets').getByRole('button', { name: /VERIFIED/ }).first()
    await badge.click()
    const dialog = page.getByRole('dialog', { name: 'Proveniência do dado' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Fonte primária')
    await expect(dialog).toContainText('Secundária')
  })

  test('no horizontal scroll on the page', async ({ page }) => {
    await page.goto('/?date=2026-09-29')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('empty date shows a clear state instead of inventing content', async ({ page }) => {
    await page.goto('/?date=2026-09-01')
    await expect(page.getByRole('heading', { name: /Nenhum briefing para 01 SET 2026/ })).toBeVisible()
  })
})
