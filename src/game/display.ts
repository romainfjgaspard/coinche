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

/**
 * Durée pendant laquelle un pli complet reste sur le tapis avant d'être ramassé.
 * Sans elle, la quatrième carte n'apparaissait jamais : le pli se vidait à l'instant
 * où elle était posée.
 */
export const PLI_VISIBLE_MS = 1600

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
 * Disposition classique des pointes : colonnes à 15 % / 50 % / 85 %, rangées de
 * 15 % à 85 % de la zone centrale. Les colonnes sont écartées au maximum : avec des
 * pointes assez grosses pour dominer l'index, la pointe du milieu touchait ses
 * voisines sur le 9 et le 10.
 */
const LAYOUTS: Partial<Record<Rank, [number, number][]>> = {
  A: [[50, 50]],
  '7': [[15, 15], [85, 15], [15, 50], [85, 50], [15, 85], [85, 85], [50, 32.5]],
  '8': [[15, 15], [85, 15], [15, 50], [85, 50], [15, 85], [85, 85], [50, 32.5], [50, 67.5]],
  '9': [[15, 15], [85, 15], [15, 38.3], [85, 38.3], [15, 61.7], [85, 61.7], [15, 85], [85, 85], [50, 50]],
  '10': [[15, 15], [85, 15], [15, 38.3], [85, 38.3], [15, 61.7], [85, 61.7], [15, 85], [85, 85], [50, 26.7], [50, 73.3]],
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
