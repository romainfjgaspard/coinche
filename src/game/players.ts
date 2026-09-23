/**
 * Roster figé, placement variable.
 *
 * Les quatre joueurs ne changent jamais — leurs identifiants portent toutes les
 * statistiques. En revanche **le placement autour de la table change d'une partie
 * à l'autre** : il détermine les équipes, et il est enregistré dans le journal
 * pour que l'historique reste interprétable.
 */
export const PLAYER_IDS = ['benel', 'roux', 'viv', 'romain'] as const
export type PlayerId = (typeof PLAYER_IDS)[number]

export const PLAYER_NAMES: Record<PlayerId, string> = {
  benel: 'Benel',
  roux: 'Roux',
  viv: 'Viv',
  romain: 'Romain',
}

/** Les quatre places, dans le sens du jeu (MAT-2). Les sièges 0 et 2 font équipe. */
export type Seating = readonly [PlayerId, PlayerId, PlayerId, PlayerId]

export const DEFAULT_SEATING: Seating = ['romain', 'benel', 'viv', 'roux']

export const seatOf = (player: PlayerId, seating: Seating): number => seating.indexOf(player)
export const playerAtSeat = (seat: number, seating: Seating): PlayerId =>
  seating[((seat % 4) + 4) % 4]
export const teamOfPlayer = (player: PlayerId, seating: Seating): 0 | 1 =>
  (seatOf(player, seating) % 2) as 0 | 1
export const nextPlayer = (player: PlayerId, seating: Seating): PlayerId =>
  playerAtSeat(seatOf(player, seating) + 1, seating)

export const partnerOf = (player: PlayerId, seating: Seating): PlayerId =>
  playerAtSeat(seatOf(player, seating) + 2, seating)

/** Les trois appariements possibles à quatre joueurs. */
export const PAIRINGS: readonly Seating[] = [
  ['romain', 'benel', 'viv', 'roux'], // Romain+Viv contre Benel+Roux
  ['romain', 'viv', 'roux', 'benel'], // Romain+Roux contre Viv+Benel
  ['romain', 'roux', 'benel', 'viv'], // Romain+Benel contre Roux+Viv
]

/** Nom stable d'un appariement, pour regrouper les statistiques. */
export function pairingKey(seating: Seating): string {
  const paire = (a: PlayerId, b: PlayerId) => [a, b].sort().join('+')
  return [paire(seating[0], seating[2]), paire(seating[1], seating[3])].sort().join(' vs ')
}

/** Tirage au sort d'un placement, RNG injectable pour que les tests soient sûrs. */
export function randomSeating(random: () => number = Math.random): Seating {
  const out = [...PLAYER_IDS]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out as unknown as Seating
}

/** Placement construit à partir d'une équipe choisie à la main. */
export function seatingFromTeam(team: readonly [PlayerId, PlayerId]): Seating {
  const autres = PLAYER_IDS.filter((p) => !team.includes(p))
  return [team[0], autres[0], team[1], autres[1]] as Seating
}
