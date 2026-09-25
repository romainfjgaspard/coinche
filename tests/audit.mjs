/**
 * Revue d'affichage : tous les écrans, dans les deux formats.
 *
 * Sert à relire l'interface, pas à valider une règle — d'où les captures plutôt
 * que des assertions. Nécessite l'émulateur et `npm run dev:emu`.
 */
import { chromium } from 'playwright'

const SP = process.env.SORTIE ?? '.'
const URL = 'http://127.0.0.1:5173/coinche/?botDelay=120'
const FORMATS = [
  { nom: 'tel', width: 390, height: 844 },
  { nom: 'pc', width: 1920, height: 1080 },
]

const nav = await chromium.launch()
const soucis = []

for (const f of FORMATS) {
  const ctx = await nav.newContext({ viewport: { width: f.width, height: f.height } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => soucis.push(`${f.nom} page: ${e}`))
  const prise = async (nom) => {
    await p.screenshot({ path: `${SP}/audit-${f.nom}-${nom}.png` })
  }

  await p.goto(URL, { waitUntil: 'networkidle' })
  await prise('1-qui-es-tu')

  await p.getByRole('button', { name: 'Benel' }).click()
  await p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
  await p.waitForSelector('text=Autour de la table', { timeout: 20000 })
  await prise('2-salon-vide')

  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: '+ bot', exact: true }).first().click()
    await p.waitForTimeout(900)
  }
  await p.waitForTimeout(1200)
  await prise('3-salon-complet')

  // la table démarre seule ; on attend les enchères puis le jeu
  await p.waitForSelector('text=DONNE 1', { timeout: 45000 }).catch(() => {})
  await p.waitForTimeout(1500)
  await prise('4-encheres')

  // on passe pour arriver au jeu
  for (let i = 0; i < 30; i++) {
    const passe = p.getByRole('button', { name: 'Passe' })
    if (await passe.count()) {
      await passe.click({ timeout: 2500 }).catch(() => {})
    }
    if (await p.locator('text=à toi de jouer').count()) break
    await p.waitForTimeout(500)
  }
  await prise('5-table')

  // quelques cartes pour garnir le pli et le dernier pli
  for (let i = 0; i < 14; i++) {
    if (await p.locator('text=à toi de jouer').count()) {
      const c = p.locator('button[aria-label^="Jouer le"]').first()
      if (await c.count()) await c.click({ force: true, timeout: 3000 }).catch(() => {})
    }
    await p.waitForTimeout(450)
  }
  await prise('6-pli-en-cours')

  // fin de donne
  await p.waitForSelector('text=Voir les statistiques', { timeout: 60000 }).catch(() => {})
  await prise('7-fin-de-donne')

  const stats = p.getByRole('button', { name: 'Stats' })
  if (await stats.count()) await stats.click().catch(() => {})
  else
    await p
      .getByRole('button', { name: 'Voir les statistiques' })
      .click()
      .catch(() => {})
  await p.waitForTimeout(1200)
  await prise('8-stats-partie')
  await p
    .getByRole('button', { name: 'Toutes les parties' })
    .click()
    .catch(() => {})
  await p.waitForTimeout(1200)
  await prise('9-stats-global')

  await ctx.close()
}

console.log('captures écrites dans', SP)
console.log('soucis :', soucis.length ? soucis.slice(0, 5) : 'aucune erreur de page')
await nav.close()
