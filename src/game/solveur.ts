/**
 * « Aurait-on pu gagner ? » — la donne rejouée à cartes ouvertes.
 *
 * Chacun voit les quatre mains et joue au mieux : l'équipe du preneur cherche le plus
 * de points (ou de plis, pour un capot), la défense le moins. Le résultat dit ce que
 * le preneur pouvait **garantir** face à une défense parfaite — un plafond, qui
 * suppose de tout savoir : à lire comme une indication, pas comme un reproche.
 *
 * Les cartes sont des bits (32 cartes, un entier par main) et la recherche est un
 * minimax alpha-bêta avec une table de transposition au début de chaque pli : les
 * mains d'origine étant connues, les cartes restantes et l'entameur suffisent à
 * décrire la position. Les règles de fourniture sont celles de `trick.ts`, réécrites
 * sur des bits ; un test vérifie qu'elles donnent exactement les mêmes coups.
 *
 * Le cœur de la recherche ne crée aucun objet : l'état (mains, pli en cours) vit dans
 * des tableaux typés qu'on modifie puis qu'on restaure. L'analyse carte par carte
 * appelle ce calcul des milliers de fois : c'est là que se joue sa durée.
 */
import { type Atout, type Card, DECK, isTrump, strength, value } from './cards'

export type Objectif = 'points' | 'plis'

/** Index d'une carte (0-31) : couleur × 8 + rang, dans l'ordre de `DECK`. */
export const indexDe = new Map<Card, number>(DECK.map((c, i) => [c, i]))
const MASQUE_COULEUR = [0xff, 0xff00, 0xff0000, 0xff000000 >>> 0]
const couleurIdx = (i: number) => i >> 3

interface Tables {
  force: Int8Array
  points: Int8Array
  atout: Uint8Array
  couleurAtout: number
  /** Pour chaque carte : les cartes de sa couleur plus fortes qu'elle */
  plusFortes: Uint32Array
  /** Ordre d'essai des coups : atouts d'abord, puis du plus fort au plus faible */
  cleTri: Int16Array
}

const cacheTables = new Map<Atout, Tables>()
function tables(trump: Atout): Tables {
  const deja = cacheTables.get(trump)
  if (deja) return deja
  const force = Int8Array.from(DECK.map((c) => strength(c, trump)))
  const atout = Uint8Array.from(DECK.map((c) => (isTrump(c, trump) ? 1 : 0)))
  const plusFortes = new Uint32Array(32)
  for (let c = 0; c < 32; c++) {
    let m = 0
    for (let x = 0; x < 32; x++) if (couleurIdx(x) === couleurIdx(c) && force[x] > force[c]) m |= 1 << x
    plusFortes[c] = m >>> 0
  }
  const t: Tables = {
    force,
    points: Int8Array.from(DECK.map((c) => value(c, trump))),
    atout,
    couleurAtout: trump === null || trump === 'ta' ? -1 : ['s', 'h', 'd', 'c'].indexOf(trump),
    plusFortes,
    cleTri: Int16Array.from(DECK.map((_, i) => (atout[i] ? 100 : 0) + force[i])),
  }
  cacheTables.set(trump, t)
  return t
}

const bits = (m: number): number[] => {
  const out: number[] = []
  let x = m >>> 0
  while (x) {
    const b = 31 - Math.clz32(x)
    out.push(b)
    x = (x & ~(1 << b)) >>> 0
  }
  return out
}

/**
 * La carte gagnante d'un pli en cours (indice dans `cartes`, sur les `n` premières),
 * selon les règles de `trick.ts` : l'atout l'emporte ; sinon la plus forte de la couleur
 * demandée.
 */
function gagnante(cartes: ArrayLike<number>, n: number, t: Tables): number {
  let best = 0
  const entame = couleurIdx(cartes[0])
  for (let i = 1; i < n; i++) {
    const c = cartes[i]
    const b = cartes[best]
    const cT = t.atout[c]
    const bT = t.atout[b]
    if (cT && !bT) best = i
    else if (cT === bT && couleurIdx(c) === couleurIdx(b) && t.force[c] > t.force[b]) best = i
    else if (!cT && !bT && couleurIdx(b) !== entame && couleurIdx(c) === entame) best = i
  }
  return best
}

/** Les coups permis, en masque : JEU-1 à JEU-8, comme `playableCards`. */
function coupsPermis(
  main: number,
  cartes: ArrayLike<number>,
  sieges: ArrayLike<number>,
  n: number,
  siege: number,
  t: Tables,
  toutAtout: boolean,
): number {
  if (n === 0) return main
  const entame = couleurIdx(cartes[0])
  const suivre = (main & MASQUE_COULEUR[entame]) >>> 0
  const atouts = t.couleurAtout >= 0 ? (main & MASQUE_COULEUR[t.couleurAtout]) >>> 0 : 0
  const g = gagnante(cartes, n, t)
  const partenaireMaitre = (sieges[g] & 1) === (siege & 1)
  const maitresse = cartes[g]
  if (suivre) {
    if (entame === t.couleurAtout || toutAtout) {
      const plusHautes = (suivre & t.plusFortes[maitresse]) >>> 0
      // JEU-6 — on monte, même sur son partenaire.
      return plusHautes || suivre
    }
    return suivre
  }
  if (partenaireMaitre) return main
  if (!atouts) return main
  if (t.atout[maitresse]) {
    const plusHauts = (atouts & t.plusFortes[maitresse]) >>> 0
    return plusHauts || atouts
  }
  return atouts
}

/**
 * Deux cartes de la même main, même couleur, même valeur en points, sans carte vivante
 * de la couleur entre elles : les jouer revient au même.
 */
function equivalentes(a: number, b: number, vivantes: number, t: Tables): boolean {
  if (couleurIdx(a) !== couleurIdx(b) || t.points[a] !== t.points[b]) return false
  const haut = t.force[a] > t.force[b] ? a : b
  const bas = haut === a ? b : a
  // Les cartes vivantes plus fortes que la basse, mais pas la haute ni plus fortes qu'elle.
  const entre = (vivantes & t.plusFortes[bas] & ~t.plusFortes[haut] & ~(1 << haut)) >>> 0
  return entre === 0
}

/** Pour les tests : les coups permis, sous forme de cartes. */
export function coupsPermisCartes(
  main: Card[],
  pli: { siege: number; carte: Card }[],
  siege: number,
  trump: Atout,
): Card[] {
  const t = tables(trump)
  let m = 0
  for (const c of main) m |= 1 << indexDe.get(c)!
  const cartes = pli.map((p) => indexDe.get(p.carte)!)
  const permis = coupsPermis(
    m >>> 0,
    cartes,
    pli.map((p) => p.siege),
    cartes.length,
    siege,
    t,
    trump === 'ta',
  )
  return bits(permis).map((i) => DECK[i])
}

export interface Position {
  /** Les mains restantes, par siège (0-3) */
  mains: Card[][]
  /** Le pli en cours, dans l'ordre de pose */
  pli: { siege: number; carte: Card }[]
  /** Qui entame le pli en cours (siège) */
  entameur: number
  /** Plis déjà terminés */
  plisJoues: number
  trump: Atout
  /** L'équipe du preneur : 0 (sièges 0 et 2) ou 1 */
  equipe: 0 | 1
  objectif: Objectif
}

/** Positions déjà calculées : bornes de la valeur, par cartes restantes et entameur. */
export type Memoire = Map<number, { bas: number; haut: number }>

/**
 * Ce que l'équipe du preneur peut encore gagner à partir de cette position, jeu parfait
 * des deux côtés : points de cartes et dix de der, ou nombre de plis.
 *
 * `memoire` se partage entre plusieurs appels **sur les mêmes mains d'origine, pour la
 * même équipe et le même objectif** (par exemple chaque carte candidate d'un même
 * tirage) : les positions déjà calculées servent à tous.
 */
export function resoudre(p: Position, memoire?: Memoire): number {
  const t = tables(p.trump)
  const toutAtout = p.trump === 'ta'
  const parPlis = p.objectif === 'plis'
  const equipe = p.equipe
  const tt: Memoire = memoire ?? new Map()

  // L'état, modifié en place et restauré au retour de chaque coup.
  const H = new Uint32Array(4)
  p.mains.forEach((m, s) => {
    let x = 0
    for (const c of m) x |= 1 << indexDe.get(c)!
    H[s] = x >>> 0
  })
  const TC = new Int32Array(4)
  const TS = new Int32Array(4)
  const totalPlis = p.plisJoues + (p.mains.reduce((n, m) => n + m.length, 0) + p.pli.length) / 4
  // Une liste de coups par profondeur (au plus 8 cartes permises).
  const listes = Array.from({ length: 40 }, () => new Int32Array(8))

  function gainDuPli(g: number, plis: number): number {
    if ((g & 1) !== equipe) return 0
    if (parPlis) return 1
    let s = t.points[TC[0]] + t.points[TC[1]] + t.points[TC[2]] + t.points[TC[3]]
    if (plis + 1 === totalPlis) s += 10
    return s
  }

  function recherche(
    n: number,
    entameur: number,
    plis: number,
    profondeur: number,
    alpha: number,
    beta: number,
  ): number {
    let cle = -1
    if (n === 0) {
      const reste = (H[0] | H[1] | H[2] | H[3]) >>> 0
      if (reste === 0) return 0
      cle = reste * 4 + entameur
      const e = tt.get(cle)
      if (e) {
        if (e.bas >= beta) return e.bas
        if (e.haut <= alpha) return e.haut
        if (e.bas === e.haut) return e.bas
        if (e.bas > alpha) alpha = e.bas
        if (e.haut < beta) beta = e.haut
      }
    }
    const siege = (entameur + n) & 3
    const maximise = (siege & 1) === equipe
    let permis = coupsPermis(H[siege], TC, TS, n, siege, t, toutAtout)
    // Les coups, triés du plus prometteur au moins prometteur (tri par insertion).
    const coups = listes[profondeur]
    let k = 0
    while (permis) {
      const c = 31 - Math.clz32(permis)
      permis = (permis & ~(1 << c)) >>> 0
      let i = k++
      while (i > 0 && t.cleTri[coups[i - 1]] < t.cleTri[c]) {
        coups[i] = coups[i - 1]
        i--
      }
      coups[i] = c
    }
    let vivantes = (H[0] | H[1] | H[2] | H[3]) >>> 0
    for (let i = 0; i < n; i++) vivantes = (vivantes | (1 << TC[i])) >>> 0

    const alpha0 = alpha
    const beta0 = beta
    let meilleur = maximise ? -Infinity : Infinity
    let precedente = -1
    for (let i = 0; i < k; i++) {
      const c = coups[i]
      if (precedente >= 0 && equivalentes(precedente, c, vivantes, t)) continue
      precedente = c
      const avant = H[siege]
      H[siege] = (avant & ~(1 << c)) >>> 0
      TC[n] = c
      TS[n] = siege
      let v: number
      if (n < 3) {
        v = recherche(n + 1, entameur, plis, profondeur + 1, alpha, beta)
      } else {
        const g = TS[gagnante(TC, 4, t)]
        const gain = gainDuPli(g, plis)
        // Le pli suivant réécrit TC et TS : on garde celui-ci pour les autres essais.
        const c0 = TC[0],
          c1 = TC[1],
          c2 = TC[2]
        const s0 = TS[0],
          s1 = TS[1],
          s2 = TS[2]
        v = gain + recherche(0, g, plis + 1, profondeur + 1, alpha - gain, beta - gain)
        TC[0] = c0
        TC[1] = c1
        TC[2] = c2
        TS[0] = s0
        TS[1] = s1
        TS[2] = s2
      }
      H[siege] = avant
      if (maximise) {
        if (v > meilleur) meilleur = v
        if (meilleur > alpha) alpha = meilleur
      } else {
        if (v < meilleur) meilleur = v
        if (meilleur < beta) beta = meilleur
      }
      if (alpha >= beta) break
    }
    if (cle >= 0) {
      const e = tt.get(cle) ?? { bas: -Infinity, haut: Infinity }
      if (meilleur <= alpha0) e.haut = Math.min(e.haut, meilleur)
      else if (meilleur >= beta0) e.bas = Math.max(e.bas, meilleur)
      else {
        e.bas = meilleur
        e.haut = meilleur
      }
      tt.set(cle, e)
    }
    return meilleur
  }

  const n = p.pli.length
  p.pli.forEach((x, i) => {
    TC[i] = indexDe.get(x.carte)!
    TS[i] = x.siege
  })
  // Un pli complet (une carte qu'on vient d'essayer en quatrième) : on le compte d'abord.
  if (n === 4) {
    const g = TS[gagnante(TC, 4, t)]
    const gain = gainDuPli(g, p.plisJoues)
    return gain + recherche(0, g, p.plisJoues + 1, 0, -Infinity, Infinity)
  }
  return recherche(n, p.entameur, p.plisJoues, 0, -Infinity, Infinity)
}
