/**
 * Un humain, trois bots (dont un ★) : la table doit tourner toute seule.
 *
 * C'est le besoin réel — essayer l'app sans réunir les quatre. Le test force le
 * donneur à être un bot, parce que c'est le cas qui a cassé : un bot doit savoir
 * distribuer, pas seulement suivre. Les bots tournent avec la session de l'onglet :
 * le test vérifie donc aussi que les règles Firestore les laissent jouer.
 *
 * Nécessite l'émulateur et le serveur de dev (npm run emu, npm run dev:emu).
 * Captures dans $env:OUT_DIR (par défaut : captures/). Sortie en erreur si la table
 * n'a pas joué deux donnes entières.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.OUT_DIR ?? 'captures'
mkdirSync(SP, { recursive: true })
const HUMAN = 'Benel'
/** Les bots réfléchissent vite ici : on teste l'enchaînement, pas l'ergonomie. */
const URL = 'http://localhost:5173/coinche/?botDelay=120'
const EMULATOR = 'http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents'
const DEALS = 2

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => {
  if (m.type() === 'error' || (m.type() === 'warning' && !m.text().startsWith('[p]'))) errors.push(m.text())
})
await p.goto(URL, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('text=Qui es-tu', { timeout: 30000 })

// Le bouton du joueur vient avant celui qui le retire de la liste.
await p.getByRole('button', { name: HUMAN }).first().click()
await p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
await p.waitForSelector('text=Code de la partie', { timeout: 20000 })
const code = (
  await p.locator('text=Code de la partie :').locator('xpath=following-sibling::span[1]').innerText()
).trim()

// Trois bots prennent les places libres : deux de base, un ★.
for (const name of ['+ bot', '+ bot', '+ bot ★']) {
  await p.getByRole('button', { name: name, exact: true }).first().click()
  await p.waitForTimeout(1200)
}

// La table est complète : le bouton de lancement nomme le donneur. On change de duo
// jusqu'à ce que ce soit un bot, pour qu'un bot ait à distribuer.
const launch = p.getByRole('button', { name: /Lancer la partie|^Distribuer$/ })
await launch.waitFor({ timeout: 20000 })
for (const duo of await p.locator('button', { hasText: 'contre' }).all()) {
  if (!(await launch.innerText()).includes('Distribuer')) break
  await duo.click()
  await p.waitForTimeout(800)
}
const launchText = await launch.innerText()
console.log('game', code, '·', launchText)
if (launchText.includes('Distribuer')) console.log('ATTENTION : aucun placement ne met un bot au donneur')
await p.screenshot({ path: `${SP}/bot-01-salon.png` })
await launch.click()

const start = Date.now()
const started = await p
  .waitForSelector('text=DONNE 1', { timeout: 60000 })
  .then(() => true)
  .catch(() => false)
console.log(
  'la table a démarré :',
  started,
  started ? `(en ${((Date.now() - start) / 1000).toFixed(1)} s)` : '',
)

/** Ce que dit le journal : c'est lui qui fait foi. */
async function log() {
  const r = await fetch(`${EMULATOR}/games/${code}/events?pageSize=1000`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return ((await r.json()).documents ?? []).map((d) => d.fields)
}
const dealsDone = async () => (await log()).filter((f) => f.type.stringValue === 'deal_done').length

/** L'humain joue bêtement : première carte jouable, et il passe toujours. */
let cards = 0
const deadline = Date.now() + 6 * 60 * 1000
while (Date.now() < deadline && (await dealsDone()) < DEALS) {
  const nextGame = p.getByRole('button', { name: 'Distribuer la donne suivante' })
  if (await nextGame.count()) {
    await nextGame.click().catch(() => {})
    continue
  }
  // La carte d'abord : le panneau d'enchères peut encore traîner à l'écran.
  if (await p.locator('text=à toi de jouer').count()) {
    const card = p.locator('button[aria-label^="Jouer le"]').first()
    if (await card.count()) {
      // Clic sur le bouton lui-même : les cartes de la main se chevauchent, et un clic au
      // centre tombait sur la voisine, non jouable.
      await card
        .evaluate((b) => b.click())
        .then(() => cards++)
        .catch(() => {})
      await p.waitForTimeout(300)
      const err = await p.evaluate(
        () =>
          document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').error,
      )
      if (err) errors.push('écran : ' + err)
    }
    continue
  }
  if (await p.locator('text=Ton enchère').count()) {
    await p
      .getByRole('button', { name: 'Passe' })
      .click({ timeout: 3000 })
      .catch(() => {})
    continue
  }
  await p.waitForTimeout(400)
}

const events = await log()
const tally = {}
for (const f of events) tally[f.type.stringValue] = (tally[f.type.stringValue] ?? 0) + 1
const finishedGames = tally.deal_done ?? 0
console.log("cartes posées par l'humain :", cards)
console.log('journal :', JSON.stringify(tally))
await p.screenshot({ path: `${SP}/bot-02-table.png` })
console.log('erreurs de la page :', errors.length)
for (const e of [...new Set(errors)].slice(0, 5)) console.log('   ', e.slice(0, 200))
await nav.close()

if (finishedGames < DEALS) {
  console.log(`ÉCHEC : ${finishedGames} donne(s) finie(s) sur ${DEALS}`)
  process.exit(1)
}
console.log(`OK : ${finishedGames} donnes jouées entières, en ${((Date.now() - start) / 1000).toFixed(0)} s`)
