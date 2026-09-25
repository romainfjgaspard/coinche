/** Jeu de la carte : ce qu'on a le droit de jouer, et qui remporte le pli. */
import { type Atout, type Card, isTrump, strength, suitOf, value } from './cards'

/** Une carte posée sur la table, avec son auteur (index de siège 0-3). */
export interface PlayedCard {
  seat: number
  card: Card
}

/** Index du gagnant dans le pli (0 = premier à avoir joué), et non le siège. */
function winningIndex(trick: PlayedCard[], trump: Atout): number {
  const lead = suitOf(trick[0].card)
  let best = 0
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i].card
    const b = trick[best].card
    const cTrump = isTrump(c, trump)
    const bTrump = isTrump(b, trump)
    if (cTrump && !bTrump) best = i
    else if (cTrump === bTrump && suitOf(c) === suitOf(b) && strength(c, trump) > strength(b, trump)) best = i
    else if (!cTrump && !bTrump && suitOf(b) !== lead && suitOf(c) === lead) best = i
  }
  return best
}

export function trickWinner(trick: PlayedCard[], trump: Atout): number {
  return trick[winningIndex(trick, trump)].seat
}

export function trickPoints(trick: PlayedCard[], trump: Atout): number {
  return trick.reduce((sum, p) => sum + value(p.card, trump), 0)
}

const sameTeam = (a: number, b: number) => (a & 1) === (b & 1)

/**
 * JEU-2 à JEU-8 — cartes jouables.
 * Retourner la liste complète (plutôt qu'un booléen) permet de la journaliser
 * dans `jouablesAvant[]`, et donc d'analyser plus tard ce qu'un joueur aurait pu jouer.
 */
export function playableCards(hand: Card[], trick: PlayedCard[], trump: Atout, seat: number): Card[] {
  // JEU-1 — celui qui entame joue ce qu'il veut
  if (trick.length === 0) return [...hand]

  const lead = suitOf(trick[0].card)
  const followers = hand.filter((c) => suitOf(c) === lead)
  const trumps = hand.filter((c) => isTrump(c, trump))

  const bestIdx = winningIndex(trick, trump)
  const partnerWinning = sameTeam(trick[bestIdx].seat, seat)
  const winningCard = trick[bestIdx].card

  // JEU-2 — fournir la couleur demandée
  if (followers.length > 0) {
    // Cas particulier : on demande atout, il faut monter si possible — et au
    // tout-atout, chaque couleur est un atout : on monte toujours.
    if (lead === trump || trump === 'ta') {
      const higher = followers.filter((c) => strength(c, trump) > strength(winningCard, trump))
      return higher.length > 0 && !partnerWinning ? higher : followers
    }
    return followers
  }

  // JEU-5 — le partenaire est maître : on se défausse librement, sans obligation de couper.
  if (partnerWinning) return [...hand]

  // JEU-3 — obligation de couper si l'adversaire est maître
  if (trumps.length === 0) return [...hand]

  // JEU-4 — obligation de monter à l'atout si un adversaire a déjà coupé.
  // JEU-8 — à défaut de pouvoir monter, la sous-coupe reste obligatoire.
  if (isTrump(winningCard, trump)) {
    const higher = trumps.filter((c) => strength(c, trump) > strength(winningCard, trump))
    return higher.length > 0 ? higher : trumps
  }
  return trumps
}
