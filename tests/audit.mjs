/**
 * Revue d'affichage : tous les écrans, dans les deux formats.
 *
 * Sert à relire l'interface, pas à valider une règle — d'où les captures plutôt
 * que des assertions. Nécessite l'émulateur et `npm run dev:emu`.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.OUT_DIR ?? 'captures'
mkdirSync(SP, { recursive: true })
const URL = 'http://localhost:5173/coinche/?botDelay=120'
const FORMATS = [
  { name: 'tel', width: 390, height: 844 },
  { name: 'pc', width: 1920, height: 1080 },
]

const nav = await chromium.launch()
const problems = []

for (const f of FORMATS) {
  const ctx = await nav.newContext({ viewport: { width: f.width, height: f.height } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(`${f.name} page: ${e}`))
  const take = async (name) => {
    await p.screenshot({ path: `${SP}/audit-${f.name}-${name}.png` })
  }

  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  await take('1-qui-es-tu')

  await p.getByRole('button', { name: 'Benel' }).first().click()
  await p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
  await p.waitForSelector('text=Code de la partie', { timeout: 20000 })
  await take('2-salon-vide')

  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: '+ bot', exact: true }).first().click()
    await p.waitForTimeout(900)
  }
  await p.waitForTimeout(1200)
  await take('3-salon-complet')

  // l'humain lance la partie ; on attend les enchères puis le jeu
  await p
    .getByRole('button', { name: /Lancer la partie|^Distribuer$/ })
    .click({ timeout: 10000 })
    .catch(() => {})
  await p.waitForSelector('text=DONNE 1', { timeout: 45000 }).catch(() => {})
  await p.waitForTimeout(1500)
  await take('4-encheres')

  // on passe pour arriver au jeu
  for (let i = 0; i < 30; i++) {
    const pass = p.getByRole('button', { name: 'Passe' })
    if (await pass.count()) {
      await pass.click({ timeout: 2500 }).catch(() => {})
    }
    if (await p.locator('text=à toi de jouer').count()) break
    await p.waitForTimeout(500)
  }
  await take('5-table')

  // quelques cartes pour garnir le pli et le dernier pli
  for (let i = 0; i < 14; i++) {
    if (await p.locator('text=à toi de jouer').count()) {
      const c = p.locator('button[aria-label^="Jouer le"]').first()
      if (await c.count()) await c.evaluate((b) => b.click()).catch(() => {})
    }
    await p.waitForTimeout(450)
  }
  await take('6-pli-en-cours')

  // on joue jusqu'au décompte de la donne
  const scoring = p.getByRole('button', { name: 'Statistiques', exact: true })
  for (let i = 0; i < 240 && !(await scoring.count()); i++) {
    if (await p.locator('text=à toi de jouer').count()) {
      const c = p.locator('button[aria-label^="Jouer le"]').first()
      if (await c.count()) await c.evaluate((b) => b.click()).catch(() => {})
    }
    await p.waitForTimeout(450)
  }
  await take('7-fin-de-donne')

  if (await scoring.count()) await scoring.click({ timeout: 5000 }).catch(() => {})
  else
    await p
      .getByRole('button', { name: 'Stats' })
      .click({ timeout: 5000 })
      .catch(() => {})
  await p.waitForTimeout(1200)
  await take('8-stats-partie')
  await p
    .getByRole('button', { name: 'Toutes les parties' })
    .click()
    .catch(() => {})
  await p.waitForTimeout(1200)
  await take('9-stats-global')

  await ctx.close()
}

console.log('captures écrites dans', SP)
console.log('soucis :', problems.length ? problems.slice(0, 5) : 'aucune erreur de page')
await nav.close()
