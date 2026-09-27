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
import { type TrumpMode, type Card, DECK, isTrump, strength, value } from './cards'

export type Objective = 'points' | 'tricks'

/** Index d'une carte (0-31) : couleur × 8 + rang, dans l'ordre de `DECK`. */
export const cardIndex = new Map<Card, number>(DECK.map((c, i) => [c, i]))
const SUIT_MASK = [0xff, 0xff00, 0xff0000, 0xff000000 >>> 0]
const suitIdx = (i: number) => i >> 3

interface Tables {
  power: Int8Array
  points: Int8Array
  trumpFlags: Uint8Array
  trumpSuitIdx: number
  /** Pour chaque carte : les cartes de sa couleur plus fortes qu'elle */
  strongerCards: Uint32Array
  /** Ordre d'essai des coups : atouts d'abord, puis du plus fort au plus faible */
  sortKey: Int16Array
}

const cacheTables = new Map<TrumpMode, Tables>()
function tables(trump: TrumpMode): Tables {
  const already = cacheTables.get(trump)
  if (already) return already
  const power = Int8Array.from(DECK.map((c) => strength(c, trump)))
  const trumpFlags = Uint8Array.from(DECK.map((c) => (isTrump(c, trump) ? 1 : 0)))
  const strongerCards = new Uint32Array(32)
  for (let c = 0; c < 32; c++) {
    let m = 0
    for (let x = 0; x < 32; x++) if (suitIdx(x) === suitIdx(c) && power[x] > power[c]) m |= 1 << x
    strongerCards[c] = m >>> 0
  }
  const t: Tables = {
    power,
    points: Int8Array.from(DECK.map((c) => value(c, trump))),
    trumpFlags,
    trumpSuitIdx: trump === null || trump === 'ta' ? -1 : ['s', 'h', 'd', 'c'].indexOf(trump),
    strongerCards,
    sortKey: Int16Array.from(DECK.map((_, i) => (trumpFlags[i] ? 100 : 0) + power[i])),
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
 * La carte gagnante d'un pli en cours (indice dans `cards`, sur les `n` premières),
 * selon les règles de `trick.ts` : l'atout l'emporte ; sinon la plus forte de la couleur
 * demandée.
 */
function winning(cards: ArrayLike<number>, n: number, t: Tables): number {
  let best = 0
  const lead = suitIdx(cards[0])
  for (let i = 1; i < n; i++) {
    const c = cards[i]
    const b = cards[best]
    const cT = t.trumpFlags[c]
    const bT = t.trumpFlags[b]
    if (cT && !bT) best = i
    else if (cT === bT && suitIdx(c) === suitIdx(b) && t.power[c] > t.power[b]) best = i
    else if (!cT && !bT && suitIdx(b) !== lead && suitIdx(c) === lead) best = i
  }
  return best
}

/** Les coups permis, en masque : JEU-1 à JEU-8, comme `playableCards`. */
function legalMoves(
  hand: number,
  cards: ArrayLike<number>,
  seatIdxs: ArrayLike<number>,
  n: number,
  seat: number,
  t: Tables,
  allTrumps: boolean,
): number {
  if (n === 0) return hand
  const lead = suitIdx(cards[0])
  const follow = (hand & SUIT_MASK[lead]) >>> 0
  const trumps = t.trumpSuitIdx >= 0 ? (hand & SUIT_MASK[t.trumpSuitIdx]) >>> 0 : 0
  const g = winning(cards, n, t)
  const partnerMaster = (seatIdxs[g] & 1) === (seat & 1)
  const masterCard = cards[g]
  if (follow) {
    if (lead === t.trumpSuitIdx || allTrumps) {
      const higherCards = (follow & t.strongerCards[masterCard]) >>> 0
      // JEU-6 — on monte, même sur son partenaire.
      return higherCards || follow
    }
    return follow
  }
  if (partnerMaster) return hand
  if (!trumps) return hand
  if (t.trumpFlags[masterCard]) {
    const higherTrumps = (trumps & t.strongerCards[masterCard]) >>> 0
    return higherTrumps || trumps
  }
  return trumps
}

/**
 * Deux cartes de la même main, même couleur, même valeur en points, sans carte vivante
 * de la couleur entre elles : les jouer revient au même.
 */
function equivalent(a: number, b: number, liveCards: number, t: Tables): boolean {
  if (suitIdx(a) !== suitIdx(b) || t.points[a] !== t.points[b]) return false
  const top = t.power[a] > t.power[b] ? a : b
  const bottom = top === a ? b : a
  // Les cartes vivantes plus fortes que la basse, mais pas la haute ni plus fortes qu'elle.
  const between = (liveCards & t.strongerCards[bottom] & ~t.strongerCards[top] & ~(1 << top)) >>> 0
  return between === 0
}

/** Pour les tests : les coups permis, sous forme de cartes. */
export function legalMovesCards(
  hand: Card[],
  trick: { seat: number; card: Card }[],
  seat: number,
  trump: TrumpMode,
): Card[] {
  const t = tables(trump)
  let m = 0
  for (const c of hand) m |= 1 << cardIndex.get(c)!
  const cards = trick.map((p) => cardIndex.get(p.card)!)
  const legal = legalMoves(
    m >>> 0,
    cards,
    trick.map((p) => p.seat),
    cards.length,
    seat,
    t,
    trump === 'ta',
  )
  return bits(legal).map((i) => DECK[i])
}

export interface Position {
  /** Les mains restantes, par siège (0-3) */
  hands: Card[][]
  /** Le pli en cours, dans l'ordre de pose */
  trick: { seat: number; card: Card }[]
  /** Qui entame le pli en cours (siège) */
  leader: number
  /** Plis déjà terminés */
  tricksPlayed: number
  trump: TrumpMode
  /** L'équipe du preneur : 0 (sièges 0 et 2) ou 1 */
  team: 0 | 1
  target: Objective
}

/** Positions déjà calculées : bornes de la valeur, par cartes restantes et entameur. */
export type TransTable = Map<number, { bottom: number; top: number }>

/**
 * Ce que l'équipe du preneur peut encore gagner à partir de cette position, jeu parfait
 * des deux côtés : points de cartes et dix de der, ou nombre de plis.
 *
 * `memo` se partage entre plusieurs appels **sur les mêmes mains d'origine, pour la
 * même équipe et le même objectif** (par exemple chaque carte candidate d'un même
 * tirage) : les positions déjà calculées servent à tous.
 */
export function solve(p: Position, memo?: TransTable): number {
  const t = tables(p.trump)
  const allTrumps = p.trump === 'ta'
  const byTricks = p.target === 'tricks'
  const team = p.team
  const tt: TransTable = memo ?? new Map()

  // L'état, modifié en place et restauré au retour de chaque coup.
  const H = new Uint32Array(4)
  p.hands.forEach((m, s) => {
    let x = 0
    for (const c of m) x |= 1 << cardIndex.get(c)!
    H[s] = x >>> 0
  })
  const TC = new Int32Array(4)
  const TS = new Int32Array(4)
  const totalTricks = p.tricksPlayed + (p.hands.reduce((n, m) => n + m.length, 0) + p.trick.length) / 4
  // Une liste de coups par profondeur (au plus 8 cartes permises).
  const lists = Array.from({ length: 40 }, () => new Int32Array(8))

  function trickGain(g: number, tricks: number): number {
    if ((g & 1) !== team) return 0
    if (byTricks) return 1
    let s = t.points[TC[0]] + t.points[TC[1]] + t.points[TC[2]] + t.points[TC[3]]
    if (tricks + 1 === totalTricks) s += 10
    return s
  }

  function search(
    n: number,
    leader: number,
    tricks: number,
    depth: number,
    alpha: number,
    beta: number,
  ): number {
    let key = -1
    if (n === 0) {
      const remainingSlots = (H[0] | H[1] | H[2] | H[3]) >>> 0
      if (remainingSlots === 0) return 0
      key = remainingSlots * 4 + leader
      const e = tt.get(key)
      if (e) {
        if (e.bottom >= beta) return e.bottom
        if (e.top <= alpha) return e.top
        if (e.bottom === e.top) return e.bottom
        if (e.bottom > alpha) alpha = e.bottom
        if (e.top < beta) beta = e.top
      }
    }
    const seat = (leader + n) & 3
    const maximise = (seat & 1) === team
    let legal = legalMoves(H[seat], TC, TS, n, seat, t, allTrumps)
    // Les coups, triés du plus prometteur au moins prometteur (tri par insertion).
    const moves = lists[depth]
    let k = 0
    while (legal) {
      const c = 31 - Math.clz32(legal)
      legal = (legal & ~(1 << c)) >>> 0
      let i = k++
      while (i > 0 && t.sortKey[moves[i - 1]] < t.sortKey[c]) {
        moves[i] = moves[i - 1]
        i--
      }
      moves[i] = c
    }
    let liveCards = (H[0] | H[1] | H[2] | H[3]) >>> 0
    for (let i = 0; i < n; i++) liveCards = (liveCards | (1 << TC[i])) >>> 0

    const alpha0 = alpha
    const beta0 = beta
    let best = maximise ? -Infinity : Infinity
    let previous = -1
    for (let i = 0; i < k; i++) {
      const c = moves[i]
      if (previous >= 0 && equivalent(previous, c, liveCards, t)) continue
      previous = c
      const before = H[seat]
      H[seat] = (before & ~(1 << c)) >>> 0
      TC[n] = c
      TS[n] = seat
      let v: number
      if (n < 3) {
        v = search(n + 1, leader, tricks, depth + 1, alpha, beta)
      } else {
        const g = TS[winning(TC, 4, t)]
        const gain = trickGain(g, tricks)
        // Le pli suivant réécrit TC et TS : on garde celui-ci pour les autres essais.
        const c0 = TC[0],
          c1 = TC[1],
          c2 = TC[2]
        const s0 = TS[0],
          s1 = TS[1],
          s2 = TS[2]
        v = gain + search(0, g, tricks + 1, depth + 1, alpha - gain, beta - gain)
        TC[0] = c0
        TC[1] = c1
        TC[2] = c2
        TS[0] = s0
        TS[1] = s1
        TS[2] = s2
      }
      H[seat] = before
      if (maximise) {
        if (v > best) best = v
        if (best > alpha) alpha = best
      } else {
        if (v < best) best = v
        if (best < beta) beta = best
      }
      if (alpha >= beta) break
    }
    if (key >= 0) {
      const e = tt.get(key) ?? { bottom: -Infinity, top: Infinity }
      if (best <= alpha0) e.top = Math.min(e.top, best)
      else if (best >= beta0) e.bottom = Math.max(e.bottom, best)
      else {
        e.bottom = best
        e.top = best
      }
      tt.set(key, e)
    }
    return best
  }

  const n = p.trick.length
  p.trick.forEach((x, i) => {
    TC[i] = cardIndex.get(x.card)!
    TS[i] = x.seat
  })
  // Un pli complet (une carte qu'on vient d'essayer en quatrième) : on le compte d'abord.
  if (n === 4) {
    const g = TS[winning(TC, 4, t)]
    const gain = trickGain(g, p.tricksPlayed)
    return gain + search(0, g, p.tricksPlayed + 1, 0, -Infinity, Infinity)
  }
  return search(n, p.leader, p.tricksPlayed, 0, -Infinity, Infinity)
}
