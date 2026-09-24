/**
 * Le bot : des règles simples, et aucune information qu'un humain n'aurait pas.
 *
 * `BotView` est volontairement étroite — sa propre main, l'atout, le contrat, ce
 * qui est sur la table et ce qui est déjà tombé. Rien d'autre n'entre ici, donc
 * le bot ne peut pas tricher, même bogué. Les règles Firestore le garantissent
 * déjà côté base (`mains/{playerId}` n'est lisible que par son occupant) ; cette
 * signature le garantit une deuxième fois côté code.
 *
 * Deux niveaux :
 * - `simple`   : ne retient que le pli en cours.
 * - `compteur` : retient aussi toutes les cartes tombées dans la donne. C'est de
 *   l'information publique — tout le monde à la table l'a vue tomber — donc ce
 *   n'est pas de la triche, juste un joueur attentif.
 */
import {
  type Atout, type Card, DECK, RANKS, SUITS, type Suit, isTrump, rankOf, strength, suitOf, value,
} from './cards'
import { forceMain } from './force'
import { type PlayerId, type Seating, partnerOf, seatOf, teamOfPlayer } from './players'
import type { CompletedTrick, Play } from './play'
import { type PlayedCard, trickWinner } from './trick'

export type BotLevel = 'simple' | 'compteur'

/** Tout ce que le bot a le droit de savoir. */
export interface BotView {
  me: PlayerId
  seating: Seating
  /** Sa main à lui, et personne d'autre */
  hand: Card[]
  trump: Atout
  taker: PlayerId
  /** Les cartes déjà posées sur le pli en cours, dans l'ordre */
  current: Play[]
  /** Les plis terminés de cette donne */
  completed: CompletedTrick[]
}

// --- Petits outils de comparaison

/** La carte la moins chère à lâcher : d'abord peu de points, puis faible. */
const cheapest = (cards: Card[], trump: Atout): Card =>
  [...cards].sort(
    (a, b) => value(a, trump) - value(b, trump) || strength(a, trump) - strength(b, trump),
  )[0]

/** La carte qui rapporte le plus : d'abord beaucoup de points, puis forte. */
const richest = (cards: Card[], trump: Atout): Card =>
  [...cards].sort(
    (a, b) => value(b, trump) - value(a, trump) || strength(b, trump) - strength(a, trump),
  )[0]

const asPlayed = (view: BotView): PlayedCard[] =>
  view.current.map((p) => ({ seat: seatOf(p.player, view.seating), card: p.card }))

/** Qui tient le pli en cours, personne si rien n'est encore posé. */
export function trickMaster(view: BotView): PlayerId | null {
  if (view.current.length === 0) return null
  const seat = trickWinner(asPlayed(view), view.trump)
  return view.seating[seat]
}

/** Poser cette carte maintenant me donnerait-il le pli ? */
function wouldWin(view: BotView, card: Card): boolean {
  const plis = [...asPlayed(view), { seat: seatOf(view.me, view.seating), card }]
  return trickWinner(plis, view.trump) === seatOf(view.me, view.seating)
}

/** Toutes les cartes que le bot a vues tomber dans cette donne. */
const seen = (view: BotView): Card[] => [
  ...view.completed.flatMap((t) => t.plays.map((p) => p.card)),
  ...view.current.map((p) => p.card),
]

/**
 * Cette carte est-elle imbattable dans sa couleur ?
 *
 * En `simple`, le bot n'a que le réflexe « l'as est maître ». En `compteur`, il
 * vérifie qu'aucune carte plus forte de la couleur ne reste dehors.
 */
export function isMaster(card: Card, view: BotView, level: BotLevel): boolean {
  if (level === 'simple') return rankOf(card) === 'A'

  const couleur = suitOf(card)
  const connues = new Set([...seen(view), ...view.hand])
  // Aucune carte plus forte de la couleur ne reste dehors
  return !RANKS.map((r) => `${r}${couleur}` as Card).some(
    (c) => strength(c, view.trump) > strength(card, view.trump) && !connues.has(c),
  )
}

/** Le pli peut-il encore m'échapper ? Le dernier à jouer ne risque plus rien. */
function stillAtRisk(view: BotView, level: BotLevel): boolean {
  if (view.current.length === 3) return false
  if (level === 'simple') return true

  // Les adversaires qui n'ont pas encore joué peuvent-ils battre le maître ?
  const connues = new Set([...seen(view), ...view.hand])
  const dehors = DECK.filter((c) => !connues.has(c))

  // Un siège fictif : on ne cherche pas qui gagnerait, seulement si le maître tombe.
  const FICTIF = -1
  return dehors.some(
    (c) => trickWinner([...asPlayed(view), { seat: FICTIF, card: c }], view.trump) === FICTIF,
  )
}

// --- L'entame

function lead(view: BotView, playable: Card[], level: BotLevel): Card {
  const { trump } = view
  const jePrends = teamOfPlayer(view.me, view.seating) === teamOfPlayer(view.taker, view.seating)
  const atouts = playable.filter((c) => isTrump(c, trump))
  const couleurs = playable.filter((c) => !isTrump(c, trump))

  // Le camp du preneur tire les atouts tant qu'il en reste dehors.
  if (jePrends && atouts.length > 0 && view.completed.length < 3) {
    return richest(atouts, trump)
  }

  // Sinon on sort ce qui est imbattable, tant que ça l'est.
  const maitres = couleurs.filter((c) => isMaster(c, view, level))
  if (maitres.length > 0) return richest(maitres, trump)

  // À défaut, on ouvre petit dans une couleur, sans gaspiller d'atout.
  return cheapest(couleurs.length > 0 ? couleurs : playable, trump)
}

// --- Le choix d'une carte

/**
 * `playable` vient de `playableFor` : le bot choisit **dans** la liste légale, il
 * ne peut donc pas produire un coup interdit, même si cette fonction se trompe.
 */
export function chooseCard(view: BotView, playable: Card[], level: BotLevel = 'simple'): Card {
  if (playable.length === 0) throw new Error('Aucune carte jouable')
  if (playable.length === 1) return playable[0]
  if (view.current.length === 0) return lead(view, playable, level)

  const { trump } = view
  const maitre = trickMaster(view)
  const partenaire = partnerOf(view.me, view.seating)

  if (maitre === partenaire) {
    // Le pli est à nous : on charge si plus personne ne peut le reprendre.
    if (stillAtRisk(view, level)) return cheapest(playable, trump)
    const sansAtout = playable.filter((c) => !isTrump(c, trump))
    return richest(sansAtout.length > 0 ? sansAtout : playable, trump)
  }

  // L'adversaire tient le pli : on le prend, au moindre coût.
  const gagnantes = playable.filter((c) => wouldWin(view, c))
  if (gagnantes.length > 0) {
    const couleurs = gagnantes.filter((c) => !isTrump(c, trump))
    const candidates = couleurs.length > 0 ? couleurs : gagnantes
    return [...candidates].sort(
      (a, b) => strength(a, trump) - strength(b, trump) || value(a, trump) - value(b, trump),
    )[0]
  }

  // On ne peut pas prendre : on se défausse au moins cher.
  return cheapest(playable, trump)
}

// --- L'enchère

/**
 * En dessous de ce seuil sur le barème de `force.ts`, le bot passe.
 *
 * Attention : ce barème a été calibré pour **mesurer le panache**, pas pour décider
 * d'une enchère. Le neuf d'atout (+2) et la chicane (+2) gonflent des mains qui n'ont
 * rien de maître — 7♠8♠9♠ sans autre atout ni as y vaut déjà 7 points. D'où un seuil
 * haut : le bot n'ouvre qu'avec du vrai jeu, typiquement le valet d'atout ou quatre
 * atouts accompagnés d'un as.
 */
export const SEUIL_ENCHERE = 10

export interface BotBid {
  value: number
  trump: Suit
}

/**
 * De combien le dernier à parler abaisse son seuil quand personne n'a pris.
 *
 * Sans ça le bot passait 74 % du temps, donc près d'une donne sur trois partait
 * à la poubelle — une partie prenait quarante donnes. Tout joueur de coinche se
 * lance à 80 dans cette situation plutôt que de laisser redistribuer.
 */
export const REMISE_DERNIER = 3

/**
 * Enchère : un seuil sur la force de main, puis un palier tous les deux points.
 *
 * Volontairement lisible — deux constantes à bouger. Les vraies habitudes du
 * groupe se liront plus tard dans le panache.
 */
export function chooseBid(
  hand: Card[],
  highest: number,
  partnerHolds: boolean,
  dernierAParler = false,
): BotBid | null {
  if (partnerHolds) return null

  const meilleure = SUITS.map((trump) => ({ trump, force: forceMain(hand, trump) })).sort(
    (a, b) => b.force - a.force,
  )[0]

  const seuil = dernierAParler && highest === 0 ? SEUIL_ENCHERE - REMISE_DERNIER : SEUIL_ENCHERE
  if (meilleure.force < seuil) return null

  const palier = 80 + 10 * Math.floor(Math.max(0, meilleure.force - SEUIL_ENCHERE) / 2)
  const value = Math.min(160, palier)
  if (value <= highest) return null

  return { value, trump: meilleure.trump }
}
