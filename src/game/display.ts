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
export const PLI_VISIBLE_MS = 1100

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

/**
 * Cadre intérieur de chaque figure, en unités du SVG (167,09 × 242,67) : marges
 * gauche, droite, haut, bas, trait compris. Relevé dans les fichiers le 24/09.
 */
const COURT_FRAME: Record<string, readonly [number, number, number, number]> = {
  Jack_of_clubs: [7.8, 7.02, 7.41, 7.41],
  Jack_of_diamonds: [8.15, 8.07, 8.11, 8.11],
  Jack_of_hearts: [9.03, 8.82, 8.93, 8.93],
  Jack_of_spades: [9.16, 8.46, 8.81, 8.81],
  King_of_clubs: [10.43, 10.17, 10.3, 10.3],
  King_of_diamonds: [9.99, 9.73, 9.86, 9.86],
  King_of_hearts: [10.34, 10.08, 10.21, 10.21],
  King_of_spades: [8.14, 8.31, 8.23, 8.22],
  Queen_of_clubs: [10.94, 10.75, 10.84, 10.85],
  Queen_of_diamonds: [8.56, 8.36, 8.46, 8.46],
  Queen_of_hearts: [9.63, 9.23, 9.43, 9.43],
  Queen_of_spades: [10.04, 9.31, 9.68, 9.67],
}

/**
 * Marge blanche gardée autour du cadre, en unités du SVG, trait du cadre compris.
 * Plus petite que le plus étroit des cadres (7 unités) : le contour de carte dessiné
 * dans le SVG, à 0,25 du bord, reste toujours dehors.
 */
const MARGE_CADRE = 6

/**
 * Où placer l'image d'une figure pour que son cadre soit à la même distance du bord
 * sur les quatre côtés, pour les douze figures. Le cadre fait partie du dessin et se
 * garde ; seul le contour de carte du SVG part, sinon deux bords se voyaient l'un
 * dans l'autre. Chaque figure a son propre cadre : un recadrage commun le laissait
 * collé au bord en haut et en bas, mais en retrait sur les côtés.
 */
export function courtCrop(card: Card): { left: string; top: string; width: string; height: string } | null {
  const rank = rankOf(card)
  if (!isCourt(rank)) return null
  const [fl, fr, ft, fb] = COURT_FRAME[`${COURT_FILE[rank as 'J' | 'Q' | 'K']}_of_${SUIT_FILE[suitOf(card)]}`]
  const [l, r, t, b] = [fl, fr, ft, fb].map((v) => v - MARGE_CADRE)
  const w = 167.09 - l - r
  const h = 242.67 - t - b
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`
  return { left: pct(-l / w), top: pct(-t / h), width: pct(167.09 / w), height: pct(242.67 / h) }
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
