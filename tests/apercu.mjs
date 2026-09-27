/**
 * Aperçu rapide des écrans de statistiques, en téléphone et en PC.
 *
 * Crée une partie, y assied les quatre joueurs, distribue, puis ouvre les deux
 * onglets de statistiques — les archives des parties précédentes sont déjà en base.
 * Nécessite l'émulateur et le serveur de dev.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.SORTIE ?? 'captures'
mkdirSync(SP, { recursive: true })
const URL = 'http://localhost:5173/coinche/'
const TAILLES = [
  { nom: 'tel', width: 390, height: 844 },
  { nom: 'pc', width: 1920, height: 1080 },
]

const nav = await chromium.launch()
const erreurs = []

async function ouvrir(nom, taille) {
  const ctx = await nav.newContext({ viewport: { width: taille.width, height: taille.height } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erreurs.push(`${nom}: ${e}`))
  p.on('console', (m) => m.type() === 'error' && erreurs.push(`${nom}: ${m.text()}`))
  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  return p
}

for (const taille of TAILLES) {
  const benel = await ouvrir('Benel', taille)
  await benel.getByRole('button', { name: 'Benel' }).first().click()
  await benel.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
  await benel.waitForSelector('text=Code de la partie', { timeout: 20000 })
  const code = (
    await benel.locator('text=Code de la partie :').locator('xpath=following-sibling::span[1]').innerText()
  ).trim()

  const autres = []
  for (const nom of ['Roux', 'Viv', 'Romain']) {
    const p = await ouvrir(nom, taille)
    await p.getByRole('button', { name: nom, exact: false }).first().click()
    await p.locator('#code').fill(code)
    await p.getByRole('button', { name: 'Rejoindre' }).click()
    await p.waitForSelector('text=Code de la partie', { timeout: 20000 })
    autres.push(p)
  }

  // quelqu'un distribue pour atteindre la table
  // Le donneur distribue : son bouton n'apparaît qu'une fois la table complète chez lui.
  for (const p of [benel, ...autres]) {
    const b = p.getByRole('button', { name: /^Distribuer$/ })
    const pret = await b
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (pret) {
      await b.click()
      break
    }
  }
  await benel.waitForSelector('text=DONNE 1', { timeout: 30000 })
  await benel.waitForTimeout(1500)
  await benel.screenshot({ path: `${SP}/table-${taille.nom}.png` })
  await benel.getByRole('button', { name: 'Stats' }).click()
  await benel.waitForTimeout(800)

  const boite = benel.locator('.overflow-y-auto').first()
  async function capturer(prefixe) {
    const h = await boite.evaluate((el) => el.scrollHeight)
    const vue = await boite.evaluate((el) => el.clientHeight)
    let n = 0
    for (let y = 0; y < h; y += vue - 40, n++) {
      await boite.evaluate((el, v) => {
        el.scrollTop = v
      }, y)
      await benel.waitForTimeout(350)
      await benel.screenshot({ path: `${SP}/${prefixe}-${taille.nom}-${n}.png` })
    }
    console.log(`${prefixe} ${taille.nom} : ${n} tranche(s), ${h}px`)
  }

  await capturer('partie')
  await benel.getByRole('button', { name: 'Toutes les parties' }).click()
  await benel.waitForTimeout(1200)
  await capturer('global')

  for (const p of [benel, ...autres]) await p.context().close()
}

console.log('erreurs :', erreurs.length ? erreurs.slice(0, 5) : 'aucune')
await nav.close()
