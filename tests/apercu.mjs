/**
 * Aperçu rapide des écrans de statistiques, en téléphone et en PC.
 *
 * Crée une partie, y assied les quatre joueurs, distribue, puis ouvre les deux
 * onglets de statistiques — les archives des parties précédentes sont déjà en base.
 * Nécessite l'émulateur et le serveur de dev.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.OUT_DIR ?? 'captures'
mkdirSync(SP, { recursive: true })
const URL = 'http://localhost:5173/coinche/'
const SIZES = [
  { name: 'tel', width: 390, height: 844 },
  { name: 'pc', width: 1920, height: 1080 },
]

const nav = await chromium.launch()
const errors = []

async function open(name, size) {
  const ctx = await nav.newContext({ viewport: { width: size.width, height: size.height } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  return p
}

for (const size of SIZES) {
  const benel = await open('Benel', size)
  await benel.getByRole('button', { name: 'Benel' }).first().click()
  await benel.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
  await benel.waitForSelector('text=Code de la partie', { timeout: 20000 })
  const code = (
    await benel.locator('text=Code de la partie :').locator('xpath=following-sibling::span[1]').innerText()
  ).trim()

  const others = []
  for (const name of ['Roux', 'Viv', 'Romain']) {
    const p = await open(name, size)
    await p.getByRole('button', { name: name, exact: false }).first().click()
    await p.locator('#code').fill(code)
    await p.getByRole('button', { name: 'Rejoindre' }).click()
    await p.waitForSelector('text=Code de la partie', { timeout: 20000 })
    others.push(p)
  }

  // quelqu'un distribue pour atteindre la table
  // Le donneur distribue : son bouton n'apparaît qu'une fois la table complète chez lui.
  for (const p of [benel, ...others]) {
    const b = p.getByRole('button', { name: /^Distribuer$/ })
    const ready = await b
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (ready) {
      await b.click()
      break
    }
  }
  await benel.waitForSelector('text=DONNE 1', { timeout: 30000 })
  await benel.waitForTimeout(1500)
  await benel.screenshot({ path: `${SP}/table-${size.name}.png` })
  await benel.getByRole('button', { name: 'Stats' }).click()
  await benel.waitForTimeout(800)

  const scrollBox = benel.locator('.overflow-y-auto').first()
  async function capture(prefix) {
    const h = await scrollBox.evaluate((el) => el.scrollHeight)
    const view = await scrollBox.evaluate((el) => el.clientHeight)
    let n = 0
    for (let y = 0; y < h; y += view - 40, n++) {
      await scrollBox.evaluate((el, v) => {
        el.scrollTop = v
      }, y)
      await benel.waitForTimeout(350)
      await benel.screenshot({ path: `${SP}/${prefix}-${size.name}-${n}.png` })
    }
    console.log(`${prefix} ${size.name} : ${n} tranche(s), ${h}px`)
  }

  await capture('game')
  await benel.getByRole('button', { name: 'Toutes les parties' }).click()
  await benel.waitForTimeout(1200)
  await capture('global')

  for (const p of [benel, ...others]) await p.context().close()
}

console.log('erreurs :', errors.length ? errors.slice(0, 5) : 'aucune')
await nav.close()
