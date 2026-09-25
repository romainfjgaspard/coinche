/**
 * Parcours complet dans le navigateur : quatre joueurs, une partie entière,
 * jusqu'à ce qu'une équipe dépasse 1000 — puis les statistiques.
 *
 * Nécessite l'émulateur et le serveur de dev déjà lancés.
 */
import { chromium } from 'playwright'

const SP = process.env.SORTIE ?? '.'
const URL = 'http://127.0.0.1:5173/coinche/'
const navigateur = await chromium.launch()
const erreurs = []
const echecs = []

async function ouvrir(nom) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erreurs.push(`${nom}: ${e}`))
  p.on('console', (m) => m.type() === 'error' && erreurs.push(`${nom}: ${m.text()}`))
  await p.goto(URL, { waitUntil: 'networkidle' })
  return { nom, p }
}

const benel = await ouvrir('Benel')
const roux = await ouvrir('Roux')
const viv = await ouvrir('Viv')
const romain = await ouvrir('Romain')
const table = [benel, roux, viv, romain]

/** Le premier joueur dont l'écran montre ce texte. */
async function celuiQuiVoit(texte, essais = 25) {
  for (let i = 0; i < essais; i++) {
    for (const j of table) if (await j.p.locator(`text=${texte}`).count()) return j
    await benel.p.waitForTimeout(250)
  }
  return null
}

// --- Création et arrivée des quatre joueurs
await benel.p.getByRole('button', { name: 'Benel' }).click()
await benel.p.getByRole('button', { name: 'Créer une nouvelle partie' }).click()
await benel.p.waitForSelector('text=Autour de la table', { timeout: 20000 })
const code = (await benel.p.locator('.font-display').first().innerText()).trim()
console.log('code de partie :', code)

for (const j of [roux, viv, romain]) {
  await j.p.getByRole('button', { name: j.nom, exact: false }).first().click()
  await j.p.locator('#code').fill(code)
  await j.p.getByRole('button', { name: 'Rejoindre' }).click()
  await j.p.waitForSelector('text=Autour de la table', { timeout: 20000 })
}
await benel.p.screenshot({ path: `${SP}/03-salon-complet.png` })

/** Écrit le journal brut de la partie dans le scratchpad et le résume. */
async function dumpJournal(etiquette) {
  const rep = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-coinche/databases/(default)/documents/parties/${code}/evenements?pageSize=400`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  const docs = (await rep.json()).documents ?? []
  const brut = docs.map((d) => {
    const f = {}
    for (const [k, v] of Object.entries(d.fields))
      f[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? null
    return f
  })
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(`${SP}/journal.json`, JSON.stringify(brut, null, 1)),
  )
  console.log(
    `[${etiquette}] ${brut.length} événements, fin :`,
    brut
      .slice(-5)
      .map((e) => `${e.type}${e.joueur ? '/' + e.joueur : ''}${e.carte ? '/' + e.carte : ''}`)
      .join(' > '),
  )
  for (const j of table) {
    const t = (await j.p.locator('body').innerText()).replace(/\n+/g, ' | ')
    console.log(`   ${j.nom}: ${t.slice(0, 150)}`)
  }
}

/** Enchères : deux passes, une annonce, puis tout le monde passe. Tolérant aux fermetures de panneau. */
async function encherir(valeur) {
  let passes = 0
  let annonce = false
  for (let i = 0; i < 24; i++) {
    const parleur = await celuiQuiVoit('Ton enchère', 8)
    if (!parleur) break
    try {
      if (!annonce && passes >= 2) {
        await parleur.p.getByRole('button', { name: String(valeur), exact: true }).click({ timeout: 4000 })
        await parleur.p.getByRole('button', { name: '♥' }).click({ timeout: 4000 })
        await parleur.p.getByRole('button', { name: /Annoncer/ }).click({ timeout: 4000 })
        annonce = true
      } else {
        await parleur.p.getByRole('button', { name: 'Passe' }).click({ timeout: 4000 })
        passes++
      }
    } catch {
      echecs.push(`enchère rejouée (${parleur.nom})`)
    }
    await parleur.p.waitForTimeout(200)
  }
  return annonce
}

/** Joue la donne jusqu'au décompte : on boucle sur la progression, pas sur un compteur. */
async function jouerLaDonne() {
  let cartes = 0
  for (let essai = 0; essai < 160; essai++) {
    // Tant que quelqu'un a la main, la donne continue : inutile de sonder la fin
    // à chaque carte, ça coûte quatre allers-retours Playwright pour rien.
    const joueur = await celuiQuiVoit('à toi de jouer', 20)
    if (!joueur) {
      // le décompte peut simplement tarder à s'afficher
      if (await celuiQuiVoit('Voir les statistiques', 12)) return cartes
      await dumpJournal(`blocage après ${cartes} cartes`)
      return cartes
    }
    const main = joueur.p.locator('[data-testid="main"] > div')
    const avant = await main.count()
    const carte = joueur.p.locator('button[aria-label^="Jouer le"]').first()
    if (!(await carte.count())) continue
    // La main se redessine dès qu'un autre joueur pose : le bouton peut se détacher
    // pendant le clic. On note et on repasse au tour suivant.
    try {
      await carte.click({ force: true, timeout: 6000 })
    } catch {
      echecs.push(`carte détachée (${joueur.nom})`)
      continue
    }
    const joue = await joueur.p
      .waitForFunction((n) => document.querySelectorAll('[data-testid="main"] > div').length < n, avant, {
        timeout: 8000,
      })
      .then(() => true)
      .catch(() => false)
    if (joue) {
      cartes++
      continue
    }
    // Pourquoi la main n'a-t-elle pas bougé ? On lit ce que l'app a affiché.
    const banniere = joueur.p.locator('p.bg-red-card')
    const message = (await banniere.count()) ? await banniere.first().innerText() : '(aucun message)'
    const tour = (await joueur.p.locator('text=à toi de jouer').count())
      ? 'a encore la main'
      : "n'a plus la main"
    echecs.push(`${joueur.nom} essai ${essai} · ${tour} · ${message}`)
  }
  return cartes
}

// --- La partie, donne après donne, jusqu'à ce qu'une équipe dépasse 1000
let donnes = 0
let finie = false
const valeurs = [90, 100, 110, 120, 130, 140, 150, 160]

for (let d = 0; d < 20 && !finie; d++) {
  const donneur = await celuiQuiVoit('Distribuer', 25)
  if (!donneur) {
    await dumpJournal('personne ne peut distribuer')
    break
  }
  await donneur.p.getByRole('button', { name: /Distribuer/ }).click()

  if (!(await encherir(valeurs[d % valeurs.length]))) {
    console.log('donne blanche, on redonne')
    continue
  }
  if (donnes === 0) {
    const j = await celuiQuiVoit('à toi de jouer', 25)
    if (j) await j.p.screenshot({ path: `${SP}/06-table.png` })
  }
  await jouerLaDonne()
  donnes++
  finie = Boolean(await celuiQuiVoit('Quitter la partie', 8))
}
console.log('donnes jouées :', donnes, '· partie terminée :', finie)

// --- Les statistiques
const surLeDecompte = await celuiQuiVoit('Voir les statistiques', 30)
const ecran = surLeDecompte ?? benel
if (surLeDecompte) {
  await ecran.p.getByRole('button', { name: 'Voir les statistiques' }).click({ timeout: 8000 })
} else {
  // la partie n'est pas allée au bout : on passe par le bouton de la table
  console.log('attention : décompte final absent, statistiques ouvertes depuis la table')
  await ecran.p.getByRole('button', { name: 'Stats' }).click({ timeout: 8000 })
}
await ecran.p.waitForTimeout(800)

/** L'écran des stats défile dans son propre bloc : on le capture par tranches. */
async function capturer(prefixe) {
  const boite = ecran.p.locator('.overflow-y-auto').first()
  const h = await boite.evaluate((el) => el.scrollHeight)
  let n = 0
  for (let y = 0; y < h; y += 780, n++) {
    await boite.evaluate((el, v) => {
      el.scrollTop = v
    }, y)
    await ecran.p.waitForTimeout(350)
    await ecran.p.screenshot({ path: `${SP}/${prefixe}-${n}.png` })
  }
  await boite.evaluate((el) => {
    el.scrollTop = 0
  })
  console.log(`${prefixe} : ${n} tranches, ${h}px`)
}
await capturer('09-stats')

await ecran.p.getByRole('button', { name: 'Toutes les parties' }).click()
await ecran.p.waitForTimeout(1500)
await capturer('10-stats-global')
const global = (await ecran.p.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log('global :', global.slice(0, 420))

console.log('clics rejoués :', echecs.length)
for (const e of echecs.slice(0, 10)) console.log('   ', e)
console.log('erreurs :', erreurs.length ? erreurs.slice(0, 5) : 'aucune')
await navigateur.close()
