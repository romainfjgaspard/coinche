/**
 * Parcours complet dans le navigateur : quatre joueurs, une partie entière,
 * jusqu'à ce qu'une équipe dépasse 1000 — puis les statistiques.
 *
 * Nécessite l'émulateur et le serveur de dev déjà lancés.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SP = process.env.OUT_DIR ?? 'captures'
mkdirSync(SP, { recursive: true })
const URL = 'http://localhost:5173/coinche/'
const browser = await chromium.launch()
const errors = []
const failures = []

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  return { name, p }
}

const benel = await open('Benel')
const roux = await open('Roux')
const viv = await open('Viv')
const romain = await open('Romain')
const table = [benel, roux, viv, romain]

/** Le premier joueur dont l'écran montre ce texte. */
async function whoSees(text, attempts = 25) {
  for (let i = 0; i < attempts; i++) {
    for (const j of table) if (await j.p.locator(`text=${text}`).count()) return j
    await benel.p.waitForTimeout(250)
  }
  return null
}

// --- Création et arrivée des quatre joueurs
await benel.p.getByRole('button', { name: 'Benel' }).first().click()
await benel.p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
await benel.p.waitForSelector('text=Code de la partie', { timeout: 20000 })
const code = (
  await benel.p.locator('text=Code de la partie :').locator('xpath=following-sibling::span[1]').innerText()
).trim()
console.log('code de partie :', code)

for (const j of [roux, viv, romain]) {
  await j.p.getByRole('button', { name: j.name, exact: false }).first().click()
  await j.p.locator('#code').fill(code)
  await j.p.getByRole('button', { name: 'Rejoindre' }).click()
  await j.p.waitForSelector('text=Code de la partie', { timeout: 20000 })
}
await benel.p.screenshot({ path: `${SP}/03-salon-complet.png` })

/** Écrit le journal brut de la partie dans le scratchpad et le résume. */
async function dumpLog(tag) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents/games/${code}/events?pageSize=400`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  const docs = (await response.json()).documents ?? []
  const raw = docs.map((d) => {
    const f = {}
    for (const [k, v] of Object.entries(d.fields))
      f[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? null
    return f
  })
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(`${SP}/journal.json`, JSON.stringify(raw, null, 1)),
  )
  console.log(
    `[${tag}] ${raw.length} événements, fin :`,
    raw
      .slice(-5)
      .map((e) => `${e.type}${e.player ? '/' + e.player : ''}${e.card ? '/' + e.card : ''}`)
      .join(' > '),
  )
  for (const j of table) {
    const t = (await j.p.locator('body').innerText()).replace(/\n+/g, ' | ')
    console.log(`   ${j.name}: ${t.slice(0, 150)}`)
  }
}

/** Enchères : deux passes, une annonce, puis tout le monde passe. Tolérant aux fermetures de panneau. */
async function bid(value) {
  let passes = 0
  let announced = false
  for (let i = 0; i < 24; i++) {
    const speaker = await whoSees('Ton enchère', 8)
    if (!speaker) break
    try {
      if (!announced && passes >= 2) {
        await speaker.p.getByRole('button', { name: String(value), exact: true }).click({ timeout: 4000 })
        await speaker.p.getByRole('button', { name: 'Atout ♥' }).click({ timeout: 4000 })
        await speaker.p.getByRole('button', { name: /Annoncer/ }).click({ timeout: 4000 })
        announced = true
      } else {
        await speaker.p.getByRole('button', { name: 'Passe' }).click({ timeout: 4000 })
        passes++
      }
    } catch {
      failures.push(`enchère rejouée (${speaker.name})`)
    }
    await speaker.p.waitForTimeout(200)
  }
  return announced
}

/** Joue la donne jusqu'au décompte : on boucle sur la progression, pas sur un compteur. */
async function playTheDeal() {
  let cards = 0
  for (let attempt = 0; attempt < 160; attempt++) {
    // Tant que quelqu'un a la main, la donne continue : inutile de sonder la fin
    // à chaque carte, ça coûte quatre allers-retours Playwright pour rien.
    const player = await whoSees('à toi de jouer', 20)
    if (!player) {
      // le décompte peut simplement tarder à s'afficher
      if (await whoSees('Statistiques', 12)) return cards
      await dumpLog(`blocage après ${cards} cartes`)
      return cards
    }
    const hand = player.p.locator('[data-testid="main"] > div')
    const before = await hand.count()
    const card = player.p.locator('button[aria-label^="Jouer le"]').first()
    if (!(await card.count())) continue
    // La main se redessine dès qu'un autre joueur pose : le bouton peut se détacher
    // pendant le clic. On note et on repasse au tour suivant.
    try {
      await card.evaluate((b) => b.click())
    } catch {
      failures.push(`carte détachée (${player.name})`)
      continue
    }
    const played = await player.p
      .waitForFunction((n) => document.querySelectorAll('[data-testid="main"] > div').length < n, before, {
        timeout: 8000,
      })
      .then(() => true)
      .catch(() => false)
    if (played) {
      cards++
      continue
    }
    // Pourquoi la main n'a-t-elle pas bougé ? On lit ce que l'app a affiché.
    const banner = player.p.locator('p[class*="bg-red-card"]')
    const message = (await banner.count()) ? await banner.first().innerText() : '(aucun message)'
    const turn = (await player.p.locator('text=à toi de jouer').count())
      ? 'a encore la main'
      : "n'a plus la main"
    failures.push(`${player.name} essai ${attempt} · ${turn} · ${message}`)
  }
  return cards
}

// --- La partie, donne après donne, jusqu'à ce qu'une équipe dépasse 1000
let deals = 0
let finished = false
const values = [90, 100, 110, 120, 130, 140, 150, 160]

for (let d = 0; d < 20 && !finished; d++) {
  const dealer = await whoSees('Distribuer', 25)
  if (!dealer) {
    await dumpLog('personne ne peut distribuer')
    break
  }
  await dealer.p.getByRole('button', { name: /Distribuer|Lancer la partie/ }).click()

  if (!(await bid(values[d % values.length]))) {
    console.log('donne blanche, on redonne')
    continue
  }
  if (deals === 0) {
    const j = await whoSees('à toi de jouer', 25)
    if (j) await j.p.screenshot({ path: `${SP}/06-table.png` })
  }
  await playTheDeal()
  deals++
  // La fin de partie se voit au bouton « Voir le résultat de la partie » (puis « Quitter la partie »).
  finished =
    Boolean(await whoSees('Voir le résultat de la partie', 8)) ||
    Boolean(await whoSees('Quitter la partie', 2))
}
console.log('donnes jouées :', deals, '· partie terminée :', finished)

// --- Les statistiques
const onScoring = await whoSees('Statistiques', 30)
const screenText = onScoring ?? benel
if (onScoring) {
  await screenText.p.getByRole('button', { name: 'Statistiques' }).click({ timeout: 8000 })
} else {
  // la partie n'est pas allée au bout : on passe par le bouton de la table
  console.log('attention : décompte final absent, statistiques ouvertes depuis la table')
  await screenText.p.getByRole('button', { name: 'Stats' }).click({ timeout: 8000 })
}
await screenText.p.waitForTimeout(800)

/** L'écran des stats défile dans son propre bloc : on le capture par tranches. */
async function capture(prefix) {
  const scrollBox = screenText.p.locator('.overflow-y-auto').first()
  const h = await scrollBox.evaluate((el) => el.scrollHeight)
  let n = 0
  for (let y = 0; y < h; y += 780, n++) {
    await scrollBox.evaluate((el, v) => {
      el.scrollTop = v
    }, y)
    await screenText.p.waitForTimeout(350)
    await screenText.p.screenshot({ path: `${SP}/${prefix}-${n}.png` })
  }
  await scrollBox.evaluate((el) => {
    el.scrollTop = 0
  })
  console.log(`${prefix} : ${n} tranches, ${h}px`)
}
await capture('09-stats')

await screenText.p.getByRole('button', { name: 'Toutes les parties' }).click()
await screenText.p.waitForTimeout(1500)
await capture('10-stats-global')
const global = (await screenText.p.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log('global :', global.slice(0, 420))

console.log('clics rejoués :', failures.length)
for (const e of failures.slice(0, 10)) console.log('   ', e)
console.log('erreurs :', errors.length ? errors.slice(0, 5) : 'aucune')
await browser.close()
