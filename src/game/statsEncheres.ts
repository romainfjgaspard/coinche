/**
 * Statistiques des enchères et du temps, par joueur, depuis le journal d'une partie.
 *
 * - la répartition de ses annonces, à chaque prise de parole (pas seulement la finale) ;
 * - lanceur, suiveur ou seul, sur les donnes où son équipe a le contrat ;
 * - l'écart entre les points faits et l'annonce, quand il a pris ;
 * - ses temps de réflexion, un par décision, pour en tracer la distribution.
 *
 * Pur : ni Firestore ni Vue. Les mêmes fonctions servent à la partie en cours et à
 * l'archive déposée en fin de partie, que les statistiques globales additionnent.
 */
import type { BiddingEntry, Declaration } from './bidding'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, teamOfPlayer } from './players'

/** Les annonces possibles à son tour de parole, dans l'ordre de l'échelle. */
export const CATEGORIES_ANNONCE = [
  'passe', '80', '90', '100', '110', '120', '130', '140', '150', '160', '170', 'capot', 'generale',
] as const
export type CategorieAnnonce = (typeof CATEGORIES_ANNONCE)[number]
/** Les paliers seuls, sans la passe : l'axe des courbes. */
export const PALIERS: CategorieAnnonce[] = CATEGORIES_ANNONCE.filter((c) => c !== 'passe')

export const LIBELLE_ANNONCE: Record<CategorieAnnonce, string> = Object.fromEntries(
  CATEGORIES_ANNONCE.map((c) => [c, c === 'passe' ? 'Passe' : c === 'capot' ? 'Capot' : c === 'generale' ? 'Gén.' : c]),
) as Record<CategorieAnnonce, string>

export type Repartition = Partial<Record<CategorieAnnonce, number>>

/** La catégorie d'une prise de parole ; nulle pour une coinche, qui se dit hors tour. */
export function categorieAnnonce(entry: BiddingEntry): CategorieAnnonce | null {
  switch (entry.kind) {
    case 'passe': return 'passe'
    case 'capot': return 'capot'
    case 'generale': return 'generale'
    case 'contrat': {
      const c = String(entry.value) as CategorieAnnonce
      return (CATEGORIES_ANNONCE as readonly string[]).includes(c) ? c : null
    }
    default: return null
  }
}

/** Chaque prise de parole de chaque joueur, comptée par catégorie. */
export function repartitionAnnonces(events: GameEvent[]): Map<PlayerId, Repartition> {
  const out = new Map<PlayerId, Repartition>()
  for (const e of events) {
    if (e.type !== 'enchere') continue
    const c = categorieAnnonce(e.entry)
    if (!c) continue
    const r = out.get(e.player) ?? {}
    r[c] = (r[c] ?? 0) + 1
    out.set(e.player, r)
  }
  return out
}

export interface Roles {
  /** Premier de son équipe à annoncer la couleur finale, suivi ensuite par son partenaire */
  lanceur: number
  /** A monté dans la couleur que son partenaire avait lancée */
  suiveur: number
  /** A annoncé la couleur finale sans que son partenaire ne la suive jamais */
  seul: number
}
export const rolesVides = (): Roles => ({ lanceur: 0, suiveur: 0, seul: 0 })

/** La couleur (ou SA, TA) d'une annonce chiffrée, d'un capot ou d'une générale. */
function declarationDe(entry: BiddingEntry): Declaration | null {
  if (entry.kind === 'contrat') return entry.suit
  if (entry.kind === 'capot' || entry.kind === 'generale') return entry.declaration
  return null
}

/**
 * Sur chaque donne où son équipe a le contrat : qui a ouvert la couleur finale. Le
 * premier de l'équipe à l'avoir annoncée est le lanceur, quelles que soient les
 * relances ensuite (« A 80♠, B 90♠, A 100♠ » : A lance, B suit).
 */
export function rolesPrise(events: GameEvent[], seating: Seating): Map<PlayerId, Roles> {
  const out = new Map<PlayerId, Roles>()
  const pour = (p: PlayerId): Roles => {
    let r = out.get(p)
    if (!r) { r = rolesVides(); out.set(p, r) }
    return r
  }
  let paroles: BiddingEntry[] = []
  for (const e of events) {
    if (e.type === 'donne_commencee') paroles = []
    else if (e.type === 'enchere') paroles.push(e.entry)
    else if (e.type === 'contrat_fixe') {
      const finale = e.declaration ?? e.trump
      if (!finale) continue
      const equipe = teamOfPlayer(e.taker, seating)
      const dansLaCouleur = paroles.filter(
        (b) => declarationDe(b) === finale && teamOfPlayer(b.player, seating) === equipe,
      )
      const ordre = [...new Set(dansLaCouleur.map((b) => b.player))]
      if (ordre.length === 0) continue
      if (ordre.length === 1) pour(ordre[0]).seul += 1
      else {
        pour(ordre[0]).lanceur += 1
        pour(ordre[1]).suiveur += 1
      }
    }
  }
  return out
}

export interface Ecarts {
  /** Points faits moins l'annonce, contrat réussi (≥ 0) */
  reussis: number[]
  /** Points faits moins l'annonce, contrat chuté (le plus souvent < 0) */
  chutes: number[]
}
export const ecartsVides = (): Ecarts => ({ reussis: [], chutes: [] })

/**
 * Pour le preneur : les points faits (cartes, dix de der, belote) moins la valeur
 * annoncée. Capots et générales à part : ils ne se jouent pas aux points.
 */
export function ecartsAnnonce(events: GameEvent[], seating: Seating): Map<PlayerId, Ecarts> {
  const out = new Map<PlayerId, Ecarts>()
  let contrat: { taker: PlayerId; value: number; auxPoints: boolean } | null = null
  for (const e of events) {
    if (e.type === 'donne_commencee') contrat = null
    else if (e.type === 'contrat_fixe') contrat = { taker: e.taker, value: e.value, auxPoints: !e.capot && !e.generale }
    else if (e.type === 'donne_terminee' && contrat?.auxPoints && !e.blitz) {
      const faits = e.compared[teamOfPlayer(contrat.taker, seating)]
      const r = out.get(contrat.taker) ?? ecartsVides()
      if (e.status === 'chute') r.chutes.push(faits - contrat.value)
      else r.reussis.push(faits - contrat.value)
      out.set(contrat.taker, r)
    }
  }
  return out
}

export interface Temps {
  /** Secondes, au dixième, pour chaque enchère prise à son tour */
  encheres: number[]
  /** Secondes, au dixième, pour chaque carte jouée */
  cartes: number[]
}
export const tempsVides = (): Temps => ({ encheres: [], cartes: [] })

/** Chaque temps de réflexion mesuré, en secondes : de quoi en tracer la distribution. */
export function tempsParJoueur(events: GameEvent[]): Map<PlayerId, Temps> {
  const out = new Map<PlayerId, Temps>()
  for (const e of events) {
    if ((e.type !== 'enchere' && e.type !== 'carte_jouee') || e.thinkMs === undefined) continue
    const t = out.get(e.player) ?? tempsVides()
    ;(e.type === 'enchere' ? t.encheres : t.cartes).push(Math.round(e.thinkMs / 100) / 10)
    out.set(e.player, t)
  }
  return out
}

// --- Distributions : les courbes des écrans de statistiques.

/** Une tranche d'une distribution : son étiquette, et la part des valeurs qui y tombent. */
export interface Tranche {
  label: string
  /** Part en pourcentage, de 0 à 100 */
  part: number
  nombre: number
}

/** Répartit des valeurs dans des tranches [bornes[i], bornes[i+1]) ; la dernière est ouverte. */
export function histogramme(valeurs: number[], bornes: number[], label: (a: number, b: number | null) => string): Tranche[] {
  const n = valeurs.length
  return bornes.map((a, i) => {
    const b = i + 1 < bornes.length ? bornes[i + 1] : null
    const nombre = valeurs.filter((v) => v >= a && (b === null || v < b)).length
    return { label: label(a, b), part: n ? (100 * nombre) / n : 0, nombre }
  })
}

/** Les tranches des temps de réflexion, en secondes. */
export const BORNES_TEMPS = [0, 2, 5, 10, 20, 40]
export const labelTemps = (a: number, b: number | null): string => (b === null ? `> ${a}` : a === 0 ? `< ${b}` : `${a}–${b}`)

/** Les tranches des écarts à l'annonce, de 10 en 10. */
export const BORNES_ECART = [-Infinity, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]
export const labelEcart = (a: number, b: number | null): string =>
  a === -Infinity ? `< ${b}` : b === null ? `≥ ${a}` : a >= 0 ? `+${a}` : `${a}`

export const moyenneDe = (v: number[]): number | null => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

/** L'enchère moyenne d'un joueur sur les paliers chiffrés, hors capot et générale. */
export function enchereMoyenneDe(r: Repartition): number | null {
  let total = 0
  let n = 0
  for (const c of PALIERS) {
    if (c === 'capot' || c === 'generale') continue
    const k = r[c] ?? 0
    total += Number(c) * k
    n += k
  }
  return n ? total / n : null
}

/** Additionne deux répartitions : d'une partie à l'autre, pour les statistiques globales. */
export function ajouterRepartition(a: Repartition, b: Repartition): Repartition {
  const out: Repartition = { ...a }
  for (const c of CATEGORIES_ANNONCE) if (b[c]) out[c] = (out[c] ?? 0) + b[c]!
  return out
}
