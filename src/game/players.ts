/**
 * Des joueurs connus, une table de quatre.
 *
 * La liste des joueurs s'allonge (on peut en ajouter depuis l'accueil), mais un
 * identifiant ne change jamais — il porte toutes les statistiques. Une partie se
 * joue à quatre d'entre eux, et **le placement autour de la table change d'une
 * partie à l'autre** : il détermine les équipes, et il est enregistré pour que
 * l'historique reste interprétable.
 */
export type PlayerId = string

/** Les quatre du départ : toujours là, même si la liste en ligne est vide. */
export const PLAYER_IDS: readonly PlayerId[] = ['benel', 'roux', 'viv', 'romain']

export const PLAYER_NAMES: Readonly<Record<PlayerId, string>> = {
  benel: 'Benel',
  roux: 'Roux',
  viv: 'Viv',
  romain: 'Romain',
}

/**
 * Identifiant tiré d'un nom : minuscules, sans accents ni espaces.
 * « Jean-Éric » → « jean-eric ». Vide si le nom ne contient rien d'utilisable.
 */
export function playerIdFrom(nom: string): PlayerId {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
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

/** Les trois appariements possibles entre les quatre joueurs d'une table. */
export function pairingsOf(table: readonly PlayerId[]): Seating[] {
  const [a, b, c, d] = table
  return [
    [a, b, c, d], // a+c contre b+d
    [a, c, d, b], // a+d contre c+b
    [a, d, b, c], // a+b contre d+c
  ]
}

/** Les appariements des quatre du départ. */
export const PAIRINGS: readonly Seating[] = pairingsOf(DEFAULT_SEATING)

/** Nom stable d'un appariement, pour regrouper les statistiques. */
export function pairingKey(seating: Seating): string {
  const paire = (a: PlayerId, b: PlayerId) => [a, b].sort().join('+')
  return [paire(seating[0], seating[2]), paire(seating[1], seating[3])].sort().join(' vs ')
}

/** Tirage au sort d'un placement, RNG injectable pour que les tests soient sûrs. */
export function randomSeating(
  random: () => number = Math.random,
  table: readonly PlayerId[] = PLAYER_IDS,
): Seating {
  const out = [...table]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out as unknown as Seating
}

/** Placement construit à partir d'une équipe choisie à la main. */
export function seatingFromTeam(
  team: readonly [PlayerId, PlayerId],
  table: readonly PlayerId[] = PLAYER_IDS,
): Seating {
  const autres = table.filter((p) => !team.includes(p))
  return [team[0], autres[0], team[1], autres[1]] as Seating
}
