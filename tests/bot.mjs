/**
 * Un humain, trois bots : la table doit tourner toute seule.
 *
 * C'est le besoin réel — essayer l'app sans réunir les quatre. Le test force le
 * donneur à être un bot, parce que c'est le cas qui a cassé : un bot doit savoir
 * distribuer, pas seulement suivre.
 *
 * Nécessite l'émulateur et le serveur de dev.
 */
import { chromium } from 'playwright'

const SP = process.env.SORTIE ?? '.'
const HUMAIN = 'Benel'
/** Les bots réfléchissent vite ici : on teste l'enchaînement, pas l'ergonomie. */
const URL = 'http://127.0.0.1:5173/coinche/?botDelay=120'

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const erreurs = []
p.on('pageerror', (e) => erreurs.push(String(e)))
p.on('console', (m) => {
  const t = m.text()
  if (t.startsWith('[p]')) console.log(t)
  else if (['error', 'warning'].includes(m.type())) erreurs.push(t)
})
await p.goto(URL, { waitUntil: 'networkidle' })

await p.getByRole('button', { name: HUMAIN }).click()
await p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
await p.waitForSelector('text=Autour de la table', { timeout: 20000 })
const code = (await p.locator('.font-display').first().innerText()).trim()

/** Qui porte l'étiquette « donneur » dans la liste des sièges. */
async function donneur() {
  for (const t of await p.locator('ul li').allInnerTexts()) {
    if (t.includes('donneur')) return t.split('\n').find((l) => /\w{3,}/.test(l))?.trim()
  }
  return null
}

// Le donneur est le siège 1 du placement : on change de duo jusqu'à ce qu'il ne
// soit pas l'humain, pour que ce soit bien un bot qui ait à distribuer.
const duos = await p.locator('button', { hasText: 'contre' }).all()
for (const duo of duos) {
  if (!(await donneur())?.includes(HUMAIN)) break
  await duo.click()
  await p.waitForTimeout(700)
}
const quiDonne = await donneur()
console.log('partie', code, '· donneur :', quiDonne)
if (quiDonne?.includes(HUMAIN)) {
  console.log('ATTENTION : aucun placement ne met un bot au donneur, le test perd son sens')
}

// Trois bots prennent les sièges libres.
for (let i = 0; i < 3; i++) {
  await p.getByRole('button', { name: '+ bot', exact: true }).first().click()
  await p.waitForTimeout(1200)
}
await p.waitForTimeout(1500)
const sieges = (await p.locator('ul li').allInnerTexts()).map((t) => t.replace(/\n/g, ' '))
console.log('sièges :', sieges.length ? sieges : '(la table a déjà démarré)')
await p.screenshot({ path: `${SP}/bot-01-salon.png` })

// Personne ne clique « Distribuer » : c'est au bot donneur de lancer la donne.
const debut = Date.now()
const demarre = await p
  .waitForSelector('text=DONNE 1', { timeout: 90000 })
  .then(() => true)
  .catch(() => false)
console.log(
  'la table a démarré sans intervention humaine :', demarre,
  demarre ? `(en ${((Date.now() - debut) / 1000).toFixed(1)} s)` : '',
)

/** L'humain joue bêtement : première carte légale, et il passe toujours. */
let cartes = 0
for (let tour = 0; tour < 3000; tour++) {
  if (await p.getByRole('button', { name: 'Quitter la partie' }).count()) break
  const suivante = p.getByRole('button', { name: /Distribuer/ })
  if (await suivante.count()) { await suivante.first().click().catch(() => {}); continue }
  // La carte d'abord : le panneau d'enchères peut encore traîner à l'écran, et
  // cliquer « Passe » hors de son tour bloquait l'humain pour toute la donne.
  if (await p.locator('text=à toi de jouer').count()) {
    const carte = p.locator('button[aria-label^="Jouer le"]').first()
    if (await carte.count()) {
      await carte.click({ force: true, timeout: 4000 }).then(() => { cartes++ }).catch(() => {})
    }
    continue
  }
  if (await p.locator('text=Ton enchère').count()) {
    await p.getByRole('button', { name: 'Passe' }).click({ timeout: 3000 }).catch(() => {})
    continue
  }
  await p.waitForTimeout(250)
}

const ecran = (await p.locator('body').innerText()).replace(/\n+/g, ' | ')

/** Le journal fait foi : c'est lui qui dit si la table a réellement avancé. */
const rep = await fetch(
  `http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents/parties/${code}/evenements?pageSize=400`,
  { headers: { Authorization: 'Bearer owner' } })
const docs = (await rep.json()).documents ?? []
const types = docs.map((d) => d.fields.type.stringValue)
const detail = docs.slice(-6).map((d) => {
  const g = d.fields
  return `${g.type.stringValue}${g.player ? '/' + g.player.stringValue : ''}${g.card ? '/' + g.card.stringValue : ''}`
})
const compte = {}
for (const t of types) compte[t] = (compte[t] ?? 0) + 1
console.log('cartes posées par l\'humain :', cartes, '· donne :', ecran.match(/DONNE (\d+)/)?.[1] ?? '—')
console.log('journal :', JSON.stringify(compte))
console.log('derniers événements :', detail.join(' > '))
const creation = docs.find((d) => d.fields.type.stringValue === 'partie_creee')
console.log('placement :', creation?.fields?.seating?.arrayValue?.values?.map((v) => v.stringValue).join(', '))
const g = await (await fetch(
  `http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents/parties/${code}`,
  { headers: { Authorization: 'Bearer owner' } })).json()
const f = g.fields ?? {}
console.log('écran humain : monTour=' + (await p.locator('text=à toi de jouer').count()),
  '· cartes cliquables=' + (await p.locator('button[aria-label^="Jouer le"]').count()),
  '· panneau enchère=' + (await p.locator('text=Ton enchère').count()))
console.log('partie :', 'phase=' + f.phase?.stringValue, 'donne=' + f.dealNumber?.integerValue,
  'donneur=' + f.dealer?.stringValue, 'moveSeq=' + f.moveSeq?.integerValue,
  'eventSeq=' + f.eventSeq?.integerValue)
for (const j of ['benel', 'roux', 'viv', 'romain']) {
  const r = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents/parties/${code}/mains/${j}`,
    { headers: { Authorization: 'Bearer owner' } })
  const d = await r.json()
  const n = d.fields?.cards?.arrayValue?.values?.length
  console.log(`  main ${j} :`, r.status, n === undefined ? JSON.stringify(d).slice(0, 90) : `${n} cartes`)
}
await p.screenshot({ path: `${SP}/bot-02-table.png` })
console.log('écran final :', ecran.slice(0, 260))
console.log('erreurs :', erreurs.length)
for (const e of [...new Set(erreurs)].slice(0, 5)) console.log('   ', e.slice(0, 160))
await nav.close()
