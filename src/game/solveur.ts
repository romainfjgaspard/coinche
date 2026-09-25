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
 */
import { type Atout, type Card, DECK, isTrump, strength, value } from './cards'

export type Objectif = 'points' | 'plis'

/** Index d'une carte (0-31) : couleur × 8 + rang, dans l'ordre de `DECK`. */
export const indexDe = new Map<Card, number>(DECK.map((c, i) => [c, i]))
const MASQUE_COULEUR = [0xff, 0xff00, 0xff0000, 0xff000000 >>> 0]
const couleurIdx = (i: number) => i >> 3

interface Tables {
  force: number[]
  points: number[]
  atout: boolean[]
  couleurAtout: number
}

function tables(trump: Atout): Tables {
  return {
    force: DECK.map((c) => strength(c, trump)),
    points: DECK.map((c) => value(c, trump)),
    atout: DECK.map((c) => isTrump(c, trump)),
    couleurAtout: trump === null || trump === 'ta' ? -1 : ['s', 'h', 'd', 'c'].indexOf(trump),
  }
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
 * La carte gagnante d'un pli en cours (indices dans `cartes`), selon les règles de
 * `trick.ts` : l'atout l'emporte ; sinon la plus forte de la couleur demandée.
 */
function gagnante(cartes: number[], t: Tables): number {
  let best = 0
  for (let i = 1; i < cartes.length; i++) {
    const c = cartes[i]
    const b = cartes[best]
    const cT = t.atout[c]
    const bT = t.atout[b]
    if (cT && !bT) best = i
    else if (cT === bT && couleurIdx(c) === couleurIdx(b) && t.force[c] > t.force[b]) best = i
    else if (!cT && !bT && couleurIdx(b) !== couleurIdx(cartes[0]) && couleurIdx(c) === couleurIdx(cartes[0])) best = i
  }
  return best
}

/** Les coups permis, en masque : JEU-1 à JEU-8, comme `playableCards`. */
function coupsPermis(main: number, cartes: number[], sieges: number[], siege: number, t: Tables, toutAtout: boolean): number {
  if (cartes.length === 0) return main
  const entame = couleurIdx(cartes[0])
  const suivre = main & MASQUE_COULEUR[entame]
  const atouts = t.couleurAtout >= 0 ? main & MASQUE_COULEUR[t.couleurAtout] : 0
  const g = gagnante(cartes, t)
  const partenaireMaitre = (sieges[g] & 1) === (siege & 1)
  const carteMaitresse = cartes[g]
  if (suivre) {
    if (entame === t.couleurAtout || toutAtout) {
      let plusHautes = 0
      for (const c of bits(suivre)) if (t.force[c] > t.force[carteMaitresse]) plusHautes |= 1 << c
      plusHautes >>>= 0
      return plusHautes && !partenaireMaitre ? plusHautes : suivre
    }
    return suivre
  }
  if (partenaireMaitre) return main
  if (!atouts) return main
  if (t.atout[carteMaitresse]) {
    let plusHauts = 0
    for (const c of bits(atouts)) if (t.force[c] > t.force[carteMaitresse]) plusHauts |= 1 << c
    plusHauts >>>= 0
    return plusHauts || atouts
  }
  return atouts
}

/** Pour les tests : les coups permis, sous forme de cartes. */
export function coupsPermisCartes(main: Card[], pli: { siege: number; carte: Card }[], siege: number, trump: Atout): Card[] {
  const t = tables(trump)
  let m = 0
  for (const c of main) m |= 1 << indexDe.get(c)!
  const permis = coupsPermis(m >>> 0, pli.map((p) => indexDe.get(p.carte)!), pli.map((p) => p.siege), siege, t, trump === 'ta')
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

/**
 * Ce que l'équipe du preneur peut encore gagner à partir de cette position, jeu parfait
 * des deux côtés : points de cartes et dix de der, ou nombre de plis.
 */
export function resoudre(p: Position): number {
  const t = tables(p.trump)
  const toutAtout = p.trump === 'ta'
  const mains = p.mains.map((m) => {
    let x = 0
    for (const c of m) x |= 1 << indexDe.get(c)!
    return x >>> 0
  })
  const tt = new Map<number, { bas: number; haut: number }>()
  const totalPlis = p.plisJoues + (p.mains.reduce((n, m) => n + m.length, 0) + p.pli.length) / 4

  function recherche(
    mainsCourantes: number[], cartes: number[], sieges: number[], entameur: number, plis: number,
    alpha: number, beta: number,
  ): number {
    // Début de pli : la table de transposition.
    let cle = -1
    if (cartes.length === 0) {
      const reste = (mainsCourantes[0] | mainsCourantes[1] | mainsCourantes[2] | mainsCourantes[3]) >>> 0
      if (reste === 0) return 0
      cle = reste * 4 + entameur
      const e = tt.get(cle)
      if (e) {
        if (e.bas >= beta) return e.bas
        if (e.haut <= alpha) return e.haut
        if (e.bas === e.haut) return e.bas
        alpha = Math.max(alpha, e.bas)
        beta = Math.min(beta, e.haut)
      }
    }
    const siege = (entameur + cartes.length) % 4
    const maximise = (siege & 1) === p.equipe
    const permis = coupsPermis(mainsCourantes[siege], cartes, sieges, siege, t, toutAtout)
    // Les plus fortes d'abord : les coupures arrivent plus tôt.
    const coups = bits(permis).sort((a, b) => (t.atout[b] ? 100 : 0) + t.force[b] - (t.atout[a] ? 100 : 0) - t.force[a])
    const alpha0 = alpha
    const beta0 = beta
    let meilleur = maximise ? -Infinity : Infinity
    for (const c of coups) {
      const mains2 = mainsCourantes.slice()
      mains2[siege] = (mains2[siege] & ~(1 << c)) >>> 0
      const cartes2 = [...cartes, c]
      const sieges2 = [...sieges, siege]
      let v: number
      if (cartes2.length < 4) {
        v = recherche(mains2, cartes2, sieges2, entameur, plis, alpha, beta)
      } else {
        const g = sieges2[gagnante(cartes2, t)]
        const dernier = plis + 1 === totalPlis
        const gain = (g & 1) === p.equipe
          ? (p.objectif === 'plis' ? 1 : cartes2.reduce((s, x) => s + t.points[x], 0) + (dernier ? 10 : 0))
          : 0
        v = gain + recherche(mains2, [], [], g, plis + 1, alpha - gain, beta - gain)
      }
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
      else { e.bas = meilleur; e.haut = meilleur }
      tt.set(cle, e)
    }
    return meilleur
  }

  const cartes = p.pli.map((x) => indexDe.get(x.carte)!)
  const sieges = p.pli.map((x) => x.siege)
  // Un pli complet (une carte qu'on vient d'essayer en quatrième) : on le compte d'abord.
  if (cartes.length === 4) {
    const g = sieges[gagnante(cartes, t)]
    const dernier = p.plisJoues + 1 === totalPlis
    const gain = (g & 1) === p.equipe
      ? (p.objectif === 'plis' ? 1 : cartes.reduce((n, x) => n + t.points[x], 0) + (dernier ? 10 : 0))
      : 0
    return gain + recherche(mains, [], [], g, p.plisJoues + 1, -Infinity, Infinity)
  }
  return recherche(mains, cartes, sieges, p.entameur, p.plisJoues, -Infinity, Infinity)
}
