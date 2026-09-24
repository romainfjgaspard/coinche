/**
 * Les impasses — la règle maison.
 *
 * Une impasse est tentée quand un joueur garde l'as de la couleur entamée
 * alors que personne n'a encore coupé le pli : il préfère le sortir plus tard,
 * en espérant ramasser un dix. L'issue se lit au pli où l'as tombe enfin :
 * coupé, c'est raté ; s'il ramasse un dix, c'est réussi.
 *
 * Pur : se calcule depuis le seul journal, donc aussi bien en direct qu'après coup.
 */
import { type Card, type Suit, isTrump, rankOf, suitOf } from './cards'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, nextPlayer } from './players'
import { type CompletedTrick, applyPlayed, newPlay } from './play'
import { dealerOf, seatingOf } from './replay'

export type ImpasseIssue = 'reussie' | 'ratee' | 'sans_suite'

export interface Impasse {
  player: PlayerId
  /** La couleur de l'as gardé */
  suit: Suit
  /** Numéro du pli (1-8) où l'as a été gardé */
  gardeeAu: number
  /** Numéro du pli où l'as est finalement tombé */
  sortieAu: number
  issue: ImpasseIssue
  dealNumber: number
}

export interface ImpasseTally {
  tentees: number
  reussies: number
  ratees: number
}

const vide = (): ImpasseTally => ({ tentees: 0, reussies: 0, ratees: 0 })

/**
 * Les impasses d'une donne, à partir de ses plis terminés.
 *
 * On ne sait qu'un joueur tenait l'as que parce qu'il le joue plus tard : une
 * impasse n'apparaît donc qu'au pli où l'as tombe. En direct, les chiffres se
 * complètent au fil des plis et sont définitifs à la fin de la donne.
 */
export function impassesOfTricks(
  tricks: CompletedTrick[],
  trump: Suit | null,
  dealNumber = 0,
): Impasse[] {
  // Chacun joue à chaque pli : les joueurs de la donne se lisent dans les plis eux-mêmes.
  const restantes = new Map<PlayerId, Set<Card>>()
  for (const t of tricks) {
    for (const j of t.plays) {
      if (!restantes.has(j.player)) restantes.set(j.player, new Set<Card>())
      restantes.get(j.player)!.add(j.card)
    }
  }

  const out: Impasse[] = []
  const dejaVue = new Set<string>()

  tricks.forEach((trick, i) => {
    const entame = suitOf(trick.plays[0].card)
    const couleurMaitresse = entame === trump

    trick.plays.forEach((coup, rang) => {
      const as = `A${entame}` as Card
      const coupee = trick.plays.slice(0, rang).some((c) => isTrump(c.card, trump))
      const cle = `${coup.player}:${as}`

      if (
        rang > 0 &&
        !couleurMaitresse &&
        !coupee &&
        !dejaVue.has(cle) &&
        restantes.get(coup.player)!.has(as) &&
        coup.card !== as
      ) {
        dejaVue.add(cle)
        out.push({
          player: coup.player,
          suit: entame,
          gardeeAu: i + 1,
          sortieAu: 0,
          issue: 'sans_suite',
          dealNumber,
        })
      }
      restantes.get(coup.player)!.delete(coup.card)
    })
  })

  // L'issue : le pli où l'as tombe enfin
  for (const imp of out) {
    const as = `A${imp.suit}` as Card
    const index = tricks.findIndex(
      (t, i) => i >= imp.gardeeAu && t.plays.some((c) => c.player === imp.player && c.card === as),
    )
    /* c8 ignore next — l'as figure dans `restantes`, donc il est forcément joué */
    if (index === -1) continue
    const pli = tricks[index]
    imp.sortieAu = index + 1
    if (pli.winner !== imp.player) imp.issue = 'ratee'
    else if (pli.plays.some((c) => c.player !== imp.player && rankOf(c.card) === '10'))
      imp.issue = 'reussie'
    else imp.issue = 'sans_suite'
  }

  return out
}

/** Reconstruit chaque donne du journal et en extrait les impasses. */
export function impassesOfGame(
  events: GameEvent[],
  dealer: PlayerId,
  seating: Seating,
): Impasse[] {
  const out: Impasse[] = []
  let debut = 0

  const bornes: number[] = []
  events.forEach((e, i) => e.type === 'donne_commencee' && bornes.push(i))
  bornes.push(events.length)

  for (let b = 0; b < bornes.length - 1; b++) {
    debut = bornes[b]
    const tranche = events.slice(debut, bornes[b + 1])
    const ouverture = tranche[0]
    if (ouverture.type !== 'donne_commencee') continue
    const contrat = tranche.find((e) => e.type === 'contrat_fixe')
    if (!contrat || contrat.type !== 'contrat_fixe') continue

    const places = seatingOf(events.slice(0, bornes[b + 1]), seating)
    const donneur = dealerOf(tranche, dealer)
    const premier = contrat.generale ? contrat.taker : nextPlayer(donneur, places)
    let state = newPlay(contrat.trump, premier, places)
    for (const e of tranche) {
      if (e.type !== 'carte_jouee') continue
      try {
        state = applyPlayed(state, e.player, e.card)
      } catch {
        continue
      }
    }
    out.push(...impassesOfTricks(state.completed, contrat.trump, ouverture.dealNumber))
  }
  return out
}

/** Le décompte par joueur, pour les tableaux. */
export function impasseTallies(list: Impasse[]): Map<PlayerId, ImpasseTally> {
  const out = new Map<PlayerId, ImpasseTally>()
  for (const imp of list) {
    if (!out.has(imp.player)) out.set(imp.player, vide())
    const t = out.get(imp.player)!
    t.tentees += 1
    if (imp.issue === 'reussie') t.reussies += 1
    else if (imp.issue === 'ratee') t.ratees += 1
  }
  return out
}
