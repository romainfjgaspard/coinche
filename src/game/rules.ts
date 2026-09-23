/**
 * Nos règles, validées le 23/09/2026. Un seul endroit à modifier.
 * Chaque champ renvoie à un identifiant de REGLES.md.
 * Toute partie embarque une copie de cet objet dans son événement `partie_creee`,
 * pour que les statistiques restent interprétables après un changement de règle.
 */
export interface Rules {
  /** FIN-1 — il faut DÉPASSER cette valeur : 1000 ne suffit pas, il faut 1010 */
  target: number
  /** ENC-2/ENC-3 — contrats chiffrés */
  minBid: number
  maxBid: number
  bidStep: number
  /** ENC-8 / ENC-9 */
  capotValue: number
  generaleValue: number
  /** ENC-5 — un joueur qui a passé peut reparler */
  canBidAfterPass: boolean
  /** DIS-2 — false : on ramasse les plis et on coupe, sans rebattre */
  shuffleEveryDeal: boolean
  /** DIS-3 — true : sur une donne blanche, le même donneur redonne */
  sameDealerWhenAllPass: boolean
}

export const RULES: Rules = {
  target: 1000,
  minBid: 80,
  maxBid: 160,
  bidStep: 10,
  capotValue: 250,
  generaleValue: 250,
  canBidAfterPass: true,
  shuffleEveryDeal: false,
  sameDealerWhenAllPass: true,
}

/** FIN-1 — dépasser strictement l'objectif. FIN-2 et FIN-3 sont sans objet :
 *  une seule équipe marque par donne, les deux scores ne peuvent pas franchir
 *  l'objectif en même temps, ni finir à égalité. */
export const isGameOver = (scores: readonly [number, number], rules: Rules = RULES): boolean =>
  scores[0] > rules.target || scores[1] > rules.target

/** Version du moteur, écrite dans chaque partie : une règle qui change ne doit jamais
 *  rendre une partie archivée illisible. */
export const ENGINE_VERSION = 2
