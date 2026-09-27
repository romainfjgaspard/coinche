/**
 * Le bot de base : des règles de joueur de coinche, et aucune information qu'un humain
 * n'aurait pas.
 *
 * `BotView` est volontairement étroite — sa propre main, l'atout, le contrat, ce
 * qui est sur la table et ce qui est déjà tombé. Rien d'autre n'entre ici, donc
 * le bot ne peut pas tricher, même bogué. Les règles Firestore le garantissent
 * déjà côté base (`mains/{playerId}` n'est lisible que par son occupant) ; cette
 * signature le garantit une deuxième fois côté code.
 *
 * Deux niveaux :
 * - `simple`   : le bot de base, ces règles-ci. Il compte les cartes tombées et
 *   retient qui a montré qu'il n'avait plus d'atout : de l'information publique.
 * - `compteur` : le bot ★, expert. Il joue ses cartes avec le solveur, en imaginant
 *   les mains cachées (`botExpert.ts`) ; il enchérit comme le bot de base.
 *   L'identifiant `compteur` est gardé tel quel : il est enregistré dans les parties.
 */
import {
  type Atout,
  type Card,
  DECK,
  RANKS,
  SUITS,
  type Suit,
  isTrump,
  rankOf,
  strength,
  suitOf,
  value,
} from './cards'
import { type BiddingState, highestBid } from './bidding'
import { cartesImpossibles } from './analyseJoueur'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from './players'
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
  [...cards].sort((a, b) => value(a, trump) - value(b, trump) || strength(a, trump) - strength(b, trump))[0]

/** La carte qui rapporte le plus : d'abord beaucoup de points, puis forte. */
const richest = (cards: Card[], trump: Atout): Card =>
  [...cards].sort((a, b) => value(b, trump) - value(a, trump) || strength(b, trump) - strength(a, trump))[0]

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

/** Les cartes que le bot ne voit ni dans sa main ni sur la table. */
function dehors(view: BotView): Card[] {
  const connues = new Set([...seen(view), ...view.hand])
  return DECK.filter((c) => !connues.has(c))
}

/**
 * Ce que chacun a montré ne pas avoir : couleurs non fournies, atout non posé quand il
 * fallait couper. Déduit des cartes posées, donc public.
 */
function manques(view: BotView): Set<Card>[] {
  const siege = (p: PlayerId) => seatOf(p, view.seating)
  const plis = [
    ...view.completed.map((t) => t.plays.map((p) => ({ siege: siege(p.player), carte: p.card }))),
    view.current.map((p) => ({ siege: siege(p.player), carte: p.card })),
  ]
  return cartesImpossibles(plis, view.trump)
}

/** Cette carte est-elle imbattable dans sa couleur ? Plus aucune carte plus forte dehors. */
export function isMaster(card: Card, view: BotView): boolean {
  const couleur = suitOf(card)
  const out = new Set(dehors(view))
  return !RANKS.map((r) => `${r}${couleur}` as Card).some(
    (c) => strength(c, view.trump) > strength(card, view.trump) && out.has(c),
  )
}

/** Les adversaires qui doivent encore jouer dans ce pli, après moi. */
function adversairesApres(view: BotView): PlayerId[] {
  const moi = seatOf(view.me, view.seating)
  const restants = 3 - view.current.length
  const out: PlayerId[] = []
  for (let i = 1; i <= restants; i++) {
    const p = playerAtSeat(moi + i, view.seating)
    if (teamOfPlayer(p, view.seating) !== teamOfPlayer(view.me, view.seating)) out.push(p)
  }
  return out
}

/**
 * Le pli, avec cette carte en plus, peut-il encore tomber chez l'adversaire ? On regarde
 * les cartes dehors que les adversaires suivants peuvent encore avoir.
 *
 * La coupe n'est crainte que si l'adversaire a montré qu'il n'a plus la couleur, ou s'il
 * n'en reste plus dehors : au premier tour d'une couleur, un joueur prend quand même.
 */
function battable(view: BotView, pli: PlayedCard[]): boolean {
  const suivants = adversairesApres(view)
  if (suivants.length === 0) return false
  const interdit = manques(view)
  const out = dehors(view)
  const entame = suitOf(pli[0].card)
  const couleurDehors = out.filter((c) => suitOf(c) === entame)
  const FICTIF = -1
  return out.some((c) =>
    suivants.some((p) => {
      const siege = seatOf(p, view.seating)
      if (interdit[siege].has(c)) return false
      if (trickWinner([...pli, { seat: FICTIF, card: c }], view.trump) !== FICTIF) return false
      if (suitOf(c) === entame) return true
      // Une coupe (ou une surcoupe) : seulement s'il ne peut plus fournir.
      return couleurDehors.every((x) => interdit[siege].has(x))
    }),
  )
}

/** Des atouts peuvent-ils encore être chez les adversaires ? */
function atoutsAdversesPossibles(view: BotView): boolean {
  if (view.trump === null || view.trump === 'ta') return false
  const interdit = manques(view)
  const adverses = view.seating.filter(
    (p) => teamOfPlayer(p, view.seating) !== teamOfPlayer(view.me, view.seating),
  )
  return dehors(view).some(
    (c) => isTrump(c, view.trump) && adverses.some((p) => !interdit[seatOf(p, view.seating)].has(c)),
  )
}

// --- L'entame

function lead(view: BotView, playable: Card[]): Card {
  const { trump } = view
  const jePrends = teamOfPlayer(view.me, view.seating) === teamOfPlayer(view.taker, view.seating)
  const atouts = playable.filter((c) => isTrump(c, trump))
  const couleurs = playable.filter((c) => !isTrump(c, trump))

  // Le camp du preneur fait tomber les atouts adverses : l'atout maître d'abord (le
  // valet, puis le neuf une fois le valet tombé), sinon un petit, jamais le neuf sous
  // un valet encore dehors.
  if (jePrends && atouts.length > 0 && atoutsAdversesPossibles(view)) {
    const maitre = atouts.find((c) => isMaster(c, view))
    if (maitre) return maitre
    const petits = atouts.filter((c) => rankOf(c) !== '9')
    return cheapest(petits.length > 0 ? petits : atouts, trump)
  }

  // Sinon on sort ce qui est imbattable, tant que ça l'est.
  const maitres = couleurs.filter((c) => isMaster(c, view))
  if (maitres.length > 0) return richest(maitres, trump)

  if (couleurs.length === 0) return cheapest(playable, trump)

  // À défaut, on ouvre petit, de préférence dans une couleur où l'on n'expose pas un
  // dix sans son as.
  const dixExpose = (s: Suit) => couleurs.some((c) => c === `10${s}`) && !couleurs.some((c) => c === `A${s}`)
  const sures = couleurs.filter((c) => !dixExpose(suitOf(c)) && rankOf(c) !== '10')
  return cheapest(sures.length > 0 ? sures : couleurs, trump)
}

// --- Le choix d'une carte

/**
 * `playable` vient de `playableFor` : le bot choisit **dans** la liste légale, il
 * ne peut donc pas produire un coup interdit, même si cette fonction se trompe.
 */
export function chooseCard(view: BotView, playable: Card[]): Card {
  if (playable.length === 0) throw new Error('Aucune carte jouable')
  if (playable.length === 1) return playable[0]
  if (view.current.length === 0) return lead(view, playable)

  const { trump } = view
  const maitre = trickMaster(view)
  const partenaire = partnerOf(view.me, view.seating)
  const pli = asPlayed(view)

  if (maitre === partenaire) {
    // Le pli est à nous : on charge si plus personne ne peut le reprendre.
    if (battable(view, pli)) return cheapest(playable, trump)
    const sansAtout = playable.filter((c) => !isTrump(c, trump))
    return richest(sansAtout.length > 0 ? sansAtout : playable, trump)
  }

  // L'adversaire tient le pli : on le prend, au moindre coût, si ça tient.
  const moi = seatOf(view.me, view.seating)
  const gagnantes = playable
    .filter((c) => wouldWin(view, c))
    .sort((a, b) => strength(a, trump) - strength(b, trump) || value(a, trump) - value(b, trump))
  const couleursGagnantes = gagnantes.filter((c) => !isTrump(c, trump))
  const ordre = [...couleursGagnantes, ...gagnantes.filter((c) => isTrump(c, trump))]
  const sure = ordre.find((c) => !battable(view, [...pli, { seat: moi, card: c }]))
  if (sure) return sure
  // Personne ne garantit le pli : on tente la moins chère des gagnantes si elle ne coûte
  // presque rien, sinon on ne sacrifie pas un gros honneur pour rien.
  const tentative = ordre[0]
  if (tentative && value(tentative, trump) <= 4) return tentative

  // On ne peut pas prendre : on se défausse au moins cher.
  return cheapest(playable, trump)
}

// --- L'enchère

export interface BotBid {
  value: number
  trump: Suit
}

/**
 * Ce que vaut une main à cet atout, en points d'enchère : le valet 20, le neuf 15 (10
 * sans le valet), l'as d'atout 10, les autres atouts un peu, la longueur, la belote,
 * les as et dix extérieurs, les coupes.
 */
export function valeurMain(hand: Card[], trump: Suit): number {
  const atouts = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => atouts.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  if (a('9')) v += a('J') ? 15 : atouts.length >= 3 ? 10 : 5
  if (a('A')) v += 10
  if (a('10')) v += 5
  v += atouts.filter((c) => ['K', 'Q', '8', '7'].includes(rankOf(c))).length * 3
  if (atouts.length >= 4) v += 10 * (atouts.length - 3)
  if (a('K') && a('Q')) v += 20
  for (const s of SUITS) {
    if (s === trump) continue
    const couleur = hand.filter((c) => suitOf(c) === s)
    const has = (r: string) => couleur.some((c) => rankOf(c) === r)
    if (has('A')) v += 10
    if (has('A') && has('10')) v += 10
    if (atouts.length >= 3 && couleur.length === 0) v += 10
    else if (atouts.length >= 3 && couleur.length === 1 && !has('A')) v += 5
  }
  return v
}

export interface ReglagesEnchere {
  /** En dessous de cette valeur, on n'ouvre pas ; chaque tranche de 10 au-dessus monte d'un palier. */
  ouverture: number
  /** Le dernier à parler, après trois passes, se lance plus volontiers que de redistribuer. */
  dernier: number
}
export const REGLAGES: ReglagesEnchere = { ouverture: 45, dernier: 35 }

const palierDe = (v: number, seuil: number): number =>
  Math.min(160, 80 + 10 * Math.floor(Math.max(0, v - seuil) / 10))

/**
 * Ce que j'apporte à la couleur de mon partenaire, selon la convention courante : 20
 * pour le valet, 10 pour le neuf, 10 par as (atout compris), 20 pour la belote.
 */
export function soutien(hand: Card[], trump: Suit): number {
  const atouts = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => atouts.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  else if (a('9')) v += 10
  v += hand.filter((c) => rankOf(c) === 'A').length * 10
  if (a('K') && a('Q')) v += 20
  return v
}

/**
 * Enchère : ouvrir dans sa meilleure couleur, soutenir son partenaire, ou passer.
 *
 * Le soutien part de la **première** annonce du partenaire dans sa couleur : on ne le
 * donne qu'une fois, et le partenaire qui a ouvert ne remonte pas sur son propre soutien.
 */
export function chooseBid(
  hand: Card[],
  etat: BiddingState,
  me: PlayerId,
  reglages: ReglagesEnchere = REGLAGES,
): BotBid | null {
  const seating = etat.seating
  const partenaire = partnerOf(me, seating)
  const meilleure = highestBid(etat)
  if (meilleure && meilleure.kind !== 'contrat') return null
  const plancher = meilleure ? meilleure.value : 0
  const contrats = etat.entries.filter((e) => e.kind === 'contrat')
  const partenaireTient = meilleure?.player === partenaire
  const dernierAParler = etat.entries.length === 3 && meilleure === null

  // Soutenir la couleur que mon partenaire a annoncée en dernier.
  const annoncePartenaire = [...contrats].reverse().find((e) => e.player === partenaire)
  let aide: BotBid | null = null
  if (annoncePartenaire) {
    const couleur = annoncePartenaire.suit
    const premiere = contrats.find(
      (e) => e.suit === couleur && teamOfPlayer(e.player, seating) === teamOfPlayer(me, seating),
    )!
    // Seulement si c'est lui qui a ouvert : si c'était moi, son annonce était déjà un soutien.
    if (premiere.player === partenaire) {
      const cible = Math.min(160, premiere.value + soutien(hand, couleur))
      if (cible > plancher) aide = { value: cible, trump: couleur }
    }
  }

  // Ma propre couleur, si je l'ai ouverte je ne remonte pas sur le soutien du partenaire.
  const ouverte = contrats.find((e) => e.player === me)
  const seuil = dernierAParler ? reglages.dernier : reglages.ouverture
  const miennes = SUITS.map((trump) => ({ trump, v: valeurMain(hand, trump) }))
    .filter(({ trump }) => !(partenaireTient && ouverte && trump === ouverte.suit))
    .sort((a, b) => b.v - a.v)
  const mienne = miennes[0]
  let seul: BotBid | null = null
  if (mienne && mienne.v >= seuil) {
    const valeur = palierDe(mienne.v, seuil)
    if (valeur > plancher) seul = { value: valeur, trump: mienne.trump }
  }

  if (partenaireTient) {
    // Le partenaire tient : on le soutient, ou on change de couleur avec bien mieux.
    if (aide) return aide
    if (seul && seul.trump !== annoncePartenaire?.suit && seul.value >= plancher + 20) return seul
    return null
  }
  if (aide && seul) return aide.value >= seul.value ? aide : seul
  return aide ?? seul
}

// --- La coinche

/**
 * Ce qu'une main pèse **contre** un contrat à cet atout : les gros atouts qu'on tient
 * sous le preneur, la longueur d'atout qui le gêne, les as et dix extérieurs.
 */
export function valeurDefense(hand: Card[], trump: Suit): number {
  const atouts = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => atouts.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  if (a('9')) v += a('J') || atouts.length >= 3 ? 15 : 5
  if (a('A') && atouts.length >= 2) v += 10
  if (atouts.length >= 3) v += 10
  for (const s of SUITS) {
    if (s === trump) continue
    const couleur = hand.filter((c) => suitOf(c) === s)
    const has = (r: string) => couleur.some((c) => rankOf(c) === r)
    if (has('A')) v += 10
    if (has('A') && has('10')) v += 10
  }
  return v
}

export interface ReglagesCoinche {
  /** Valeur de défense qu'il faut contre un 80 */
  base: number
  /** Ce qu'on en retire par palier de 10 au-dessus de 80 : plus le contrat est haut, plus il est fragile */
  parPalier: number
}
export const REGLAGES_COINCHE: ReglagesCoinche = { base: 60, parPalier: 5 }

/** Coincher le contrat adverse ? Seulement sur un contrat chiffré, quand on tient de quoi le faire chuter. */
export function doitCoincher(
  hand: Card[],
  etat: BiddingState,
  me: PlayerId,
  reglages: ReglagesCoinche = REGLAGES_COINCHE,
): boolean {
  const meilleure = highestBid(etat)
  if (!meilleure || meilleure.kind !== 'contrat') return false
  if (teamOfPlayer(meilleure.player, etat.seating) === teamOfPlayer(me, etat.seating)) return false
  if (etat.entries.some((e) => e.kind === 'coinche')) return false
  const seuil = reglages.base - reglages.parPalier * ((meilleure.value - 80) / 10)
  return valeurDefense(hand, meilleure.suit) >= seuil
}
