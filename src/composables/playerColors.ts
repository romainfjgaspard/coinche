/**
 * Une couleur par joueur pour les courbes : distinctes entre elles et lisibles sur le
 * tapis. L'or d'abord (moi, ou le premier), puis le bleu de l'autre équipe.
 */
import type { PlayerId } from '../game/players'

export const PALETTE = [
  '#d9a441',
  '#7fa8c9',
  '#e0876a',
  '#8fbf7a',
  '#b48ead',
  '#5fb3b3',
  '#e8d5a3',
  '#d68fb0',
]

export function colorsOf(players: readonly PlayerId[]): Record<PlayerId, string> {
  return Object.fromEntries(players.map((p, i) => [p, PALETTE[i % PALETTE.length]]))
}

/**
 * Une partie : moi et mon partenaire en tons chauds (or, corail), les deux autres en
 * tons froids (bleu, vert) — comme partout ailleurs, l'or est « nous » et le bleu « eux ».
 * `players` : moi, mon partenaire, puis les deux adversaires.
 */
export function gameColors(players: readonly PlayerId[]): Record<PlayerId, string> {
  const shades = ['#d9a441', '#e0876a', '#7fa8c9', '#8fbf7a']
  return Object.fromEntries(players.map((p, i) => [p, shades[i] ?? PALETTE[i % PALETTE.length]]))
}
