/**
 * Un humain, trois bots (dont un ★) : la table doit tourner toute seule.
 *
 * C'est le besoin réel — essayer l'app sans réunir les quatre. Le test force le
 * donneur à être un bot, parce que c'est le cas qui a cassé : un bot doit savoir
 * distribuer, pas seulement suivre. Les bots tournent avec la session de l'onglet :
 * le test vérifie donc aussi que les règles Firestore les laissent jouer.
 *
 * Nécessite l'émulateur et le serveur de dev (npm run emu, npm run dev:emu).
 * Captures dans $env:SORTIE (par défaut : captures/). Sortie en erreur si la table
 * n'a pas joué deux donnes entières.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.SORTIE ?? 'captures'
mkdirSync(SP, { recursive: true })
const HUMAIN = 'Benel'
/** Les bots réfléchissent vite ici : on teste l'enchaînement, pas l'ergonomie. */
const URL = 'http://localhost:5173/coinche/?botDelay=120'
const EMULATEUR = 'http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents'
const DONNES = 2

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const erreurs = []
p.on('pageerror', (e) => erreurs.push(String(e)))
p.on('console', (m) => {
  if (m.type() === 'error' || (m.type() === 'warning' && !m.text().startsWith('[p]'))) erreurs.push(m.text())
})
await p.goto(URL, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('text=Qui es-tu', { timeout: 30000 })

// Le bouton du joueur vient avant celui qui le retire de la liste.
await p.getByRole('button', { name: HUMAIN }).first().click()
await p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
await p.waitForSelector('text=Code de la partie', { timeout: 20000 })
const code = (
  await p.locator('text=Code de la partie :').locator('xpath=following-sibling::span[1]').innerText()
).trim()

// Trois bots prennent les places libres : deux de base, un ★.
for (const nom of ['+ bot', '+ bot', '+ bot ★']) {
  await p.getByRole('button', { name: nom, exact: true }).first().click()
  await p.waitForTimeout(1200)
}

// La table est complète : le bouton de lancement nomme le donneur. On change de duo
// jusqu'à ce que ce soit un bot, pour qu'un bot ait à distribuer.
const lancer = p.getByRole('button', { name: /Lancer la partie|^Distribuer$/ })
await lancer.waitFor({ timeout: 20000 })
for (const duo of await p.locator('button', { hasText: 'contre' }).all()) {
  if (!(await lancer.innerText()).includes('Distribuer')) break
  await duo.click()
  await p.waitForTimeout(800)
}
const texteLancer = await lancer.innerText()
console.log('partie', code, '·', texteLancer)
if (texteLancer.includes('Distribuer')) console.log('ATTENTION : aucun placement ne met un bot au donneur')
await p.screenshot({ path: `${SP}/bot-01-salon.png` })
await lancer.click()

const debut = Date.now()
const demarre = await p
  .waitForSelector('text=DONNE 1', { timeout: 60000 })
  .then(() => true)
  .catch(() => false)
console.log(
  'la table a démarré :',
  demarre,
  demarre ? `(en ${((Date.now() - debut) / 1000).toFixed(1)} s)` : '',
)

/** Ce que dit le journal : c'est lui qui fait foi. */
async function journal() {
  const r = await fetch(`${EMULATEUR}/parties/${code}/evenements?pageSize=1000`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return ((await r.json()).documents ?? []).map((d) => d.fields)
}
const donnesFinies = async () =>
  (await journal()).filter((f) => f.type.stringValue === 'donne_terminee').length

/** L'humain joue bêtement : première carte jouable, et il passe toujours. */
let cartes = 0
const limite = Date.now() + 6 * 60 * 1000
while (Date.now() < limite && (await donnesFinies()) < DONNES) {
  const suivante = p.getByRole('button', { name: 'Distribuer la donne suivante' })
  if (await suivante.count()) {
    await suivante.click().catch(() => {})
    continue
  }
  // La carte d'abord : le panneau d'enchères peut encore traîner à l'écran.
  if (await p.locator('text=à toi de jouer').count()) {
    const carte = p.locator('button[aria-label^="Jouer le"]').first()
    if (await carte.count()) {
      // Clic sur le bouton lui-même : les cartes de la main se chevauchent, et un clic au
      // centre tombait sur la voisine, non jouable.
      await carte
        .evaluate((b) => b.click())
        .then(() => cartes++)
        .catch(() => {})
      await p.waitForTimeout(300)
      const err = await p.evaluate(
        () =>
          document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').error,
      )
      if (err) erreurs.push('écran : ' + err)
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

const evenements = await journal()
const compte = {}
for (const f of evenements) compte[f.type.stringValue] = (compte[f.type.stringValue] ?? 0) + 1
const finies = compte.donne_terminee ?? 0
console.log("cartes posées par l'humain :", cartes)
console.log('journal :', JSON.stringify(compte))
await p.screenshot({ path: `${SP}/bot-02-table.png` })
console.log('erreurs de la page :', erreurs.length)
for (const e of [...new Set(erreurs)].slice(0, 5)) console.log('   ', e.slice(0, 200))
await nav.close()

if (finies < DONNES) {
  console.log(`ÉCHEC : ${finies} donne(s) finie(s) sur ${DONNES}`)
  process.exit(1)
}
console.log(`OK : ${finies} donnes jouées entières, en ${((Date.now() - debut) / 1000).toFixed(0)} s`)
