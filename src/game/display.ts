/**
 * Affichage des cartes — à la française.
 * Pur : aucune dépendance à Vue, donc testable seul.
 */
import { type Card, type Rank, type Suit, rankOf, suitOf } from './cards'

/** Index à la française : l'as porte un 1, les figures V, D et R. */
export const RANK_LABEL: Record<Rank, string> = {
  '7': '7', '8': '8', '9': '9', '10': '10', J: 'V', Q: 'D', K: 'R', A: '1',
}

export const SUIT_GLYPH: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

/** Deux couleurs seulement, rouge et noir (décision du 23/09). */
export const isRed = (suit: Suit): boolean => suit === 'h' || suit === 'd'

export const isCourt = (rank: Rank): boolean => rank === 'J' || rank === 'Q' || rank === 'K'

const COURT_FILE: Record<'J' | 'Q' | 'K', string> = { J: 'Jack', Q: 'Queen', K: 'King' }
const SUIT_FILE: Record<Suit, string> = {
  s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs',
}

/** Figure au portrait français (svg-cards, David Bellot, LGPL — voir public/cards/LICENCE.md). */
export function courtImage(card: Card): string | null {
  const rank = rankOf(card)
  if (!isCourt(rank)) return null
  const file = `${COURT_FILE[rank as 'J' | 'Q' | 'K']}_of_${SUIT_FILE[suitOf(card)]}_fr.svg`
  return `${import.meta.env.BASE_URL}cards/${file}`
}

export interface Pip {
  /** Position en pourcentage de la zone centrale */
  x: number
  y: number
  /** Les pointes de la moitié basse sont retournées, comme sur une vraie carte */
  flipped: boolean
  large: boolean
}

/**
 * Disposition classique des pointes : colonnes à 26 % / 50 % / 74 %,
 * rangées de 17 % à 83 %.
 */
const LAYOUTS: Partial<Record<Rank, [number, number][]>> = {
  A: [[50, 50]],
  '7': [[26, 17], [74, 17], [26, 50], [74, 50], [26, 83], [74, 83], [50, 33]],
  '8': [[26, 17], [74, 17], [26, 50], [74, 50], [26, 83], [74, 83], [50, 33], [50, 67]],
  '9': [[26, 17], [74, 17], [26, 39], [74, 39], [26, 61], [74, 61], [26, 83], [74, 83], [50, 50]],
  '10': [[26, 17], [74, 17], [26, 39], [74, 39], [26, 61], [74, 61], [26, 83], [74, 83], [50, 28], [50, 72]],
}

export function pipLayout(rank: Rank): Pip[] {
  return (LAYOUTS[rank] ?? []).map(([x, y]) => ({
    x, y, flipped: y > 52, large: rank === 'A',
  }))
}

/** Libellé lisible, pour le chat et les journaux : « 10 de cœur ». */
export function cardLabel(card: Card): string {
  const names: Record<Suit, string> = { s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' }
  const ranks: Record<Rank, string> = {
    '7': '7', '8': '8', '9': '9', '10': '10', J: 'valet', Q: 'dame', K: 'roi', A: 'as',
  }
  return `${ranks[rankOf(card)]} de ${names[suitOf(card)]}`
}
