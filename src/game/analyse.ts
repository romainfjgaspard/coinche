/**
 * L'analyse d'une donne jouée : à cartes ouvertes, le contrat était-il faisable, et si
 * oui, à quelle carte a-t-il échappé ?
 *
 * On rejoue la donne carte par carte ; avant et après chaque carte, le solveur dit ce que
 * l'équipe du preneur pouvait encore garantir. La première carte après laquelle ce n'est
 * plus assez est le tournant — et parmi les cartes permises à ce moment, on indique celle
 * qui gardait le contrat faisable.
 */
import type { Atout, Card } from './cards'
import type { DonneRevue } from './revue'
import { type PlayerId, type Seating, seatOf, teamOfPlayer } from './players'
import { LAST_TRICK_BONUS } from './scoring'
import { type Objectif, coupsPermisCartes, resoudre } from './solveur'

export interface Analyse {
  /** Donne non analysable (générale, donne blitz, mains inconnues) : pourquoi */
  impossible?: string
  objectif?: Objectif
  /** Ce qu'il fallait : points de cartes (belote déduite), ou plis */
  requis?: number
  /** Ce que l'équipe du preneur pouvait garantir dès la première carte */
  garanti?: number
  faisable?: boolean
  /** Belote du preneur comptée (+20) dans l'objectif */
  belote?: boolean
  /** La carte qui a fait échapper le contrat, et celle qui le gardait */
  tournant?: {
    pli: number
    joueur: PlayerId
    carte: Card
    mieux: Card
    garantiAvant: number
    garantiApres: number
  }
}

/** Qui, dans l'équipe du preneur, tient le Roi et la Dame d'atout : la belote compte. */
function beloteDuPreneur(donne: DonneRevue, seating: Seating, trump: Atout): boolean {
  if (!donne.mains || !donne.contrat || trump === null || trump === 'ta') return false
  const equipe = teamOfPlayer(donne.contrat.taker, seating)
  return seating.some(
    (p) =>
      teamOfPlayer(p, seating) === equipe &&
      donne.mains![p].includes(`K${trump}` as Card) &&
      donne.mains![p].includes(`Q${trump}` as Card),
  )
}

export function analyserDonne(donne: DonneRevue, seating: Seating): Analyse {
  const c = donne.contrat
  if (!c) return { impossible: 'Aucun contrat sur cette donne.' }
  if (donne.blitz) return { impossible: 'Donne non jouée (blitz).' }
  if (!donne.mains) return { impossible: 'La donne n’est pas allée au bout.' }
  if (c.generale) return { impossible: 'Pas d’analyse pour une générale.' }
  const decl = c.declaration
  const trump: Atout = decl === 'ta' ? 'ta' : decl === 'sa' ? null : decl
  if (!c.capot && (trump === null || trump === 'ta')) return { impossible: 'Contrat sans couleur d’atout.' }

  const equipe = teamOfPlayer(c.taker, seating)
  const objectif: Objectif = c.capot ? 'plis' : 'points'
  const belote = !c.capot && beloteDuPreneur(donne, seating, trump)
  const b = belote ? 20 : 0
  // Points de cartes à atteindre : la valeur annoncée, et plus que la défense (BEL-4).
  const requis = c.capot ? 8 : Math.max(c.value - b, Math.floor((162 - b) / 2) + 1)

  // L'état au fil de la donne : mains restantes, pli en cours, ce qui est déjà acquis.
  const siege = (p: PlayerId) => seatOf(p, seating)
  const mains: Card[][] = seating.map((p) => [...donne.mains![p]])
  let pli: { siege: number; carte: Card }[] = []
  let entameur = siege(donne.plis[0].cartes[0].player)
  let acquis = 0
  let plisJoues = 0
  const valeur = () => acquis + resoudre({ mains, pli, entameur, plisJoues, trump, equipe, objectif })

  const garanti = valeur()
  const faisable = garanti >= requis
  const resultat: Analyse = { objectif, requis, garanti, faisable, belote }
  if (!faisable) return resultat

  let avant = garanti
  for (const p of donne.plis) {
    for (const { player, card } of p.cartes) {
      const s = siege(player)
      const permis = coupsPermisCartes(mains[s], pli, s, trump)
      mains[s] = mains[s].filter((x) => x !== card)
      pli = [...pli, { siege: s, carte: card }]
      if (pli.length === 4) {
        // Le pli est complet : on le compte, et le gagnant entame le suivant.
        const gagnant = siege(p.gagnant)
        if ((gagnant & 1) === equipe) {
          acquis += objectif === 'plis' ? 1 : p.points + (p.numero === 8 ? LAST_TRICK_BONUS : 0)
        }
        pli = []
        entameur = gagnant
        plisJoues += 1
      }
      const apres = pli.length === 0 && plisJoues === 8 ? acquis : valeur()
      if (avant >= requis && apres < requis && teamOfPlayer(player, seating) === equipe) {
        // Le tournant : parmi les cartes permises, celle qui gardait le contrat faisable.
        resultat.tournant = {
          pli: p.numero,
          joueur: player,
          carte: card,
          garantiAvant: avant,
          garantiApres: apres,
          mieux: meilleureCarte(donne, seating, p.numero, player, permis, trump, equipe, objectif) ?? card,
        }
        return resultat
      }
      avant = apres
    }
  }
  return resultat
}

/** Rejoue jusqu'au coup donné, essaie chaque carte permise, garde la meilleure. */
function meilleureCarte(
  donne: DonneRevue,
  seating: Seating,
  numeroPli: number,
  joueur: PlayerId,
  permis: Card[],
  trump: Atout,
  equipe: 0 | 1,
  objectif: Objectif,
): Card | null {
  const siege = (p: PlayerId) => seatOf(p, seating)
  const mains: Card[][] = seating.map((p) => [...donne.mains![p]])
  let entameur = siege(donne.plis[0].cartes[0].player)
  let plisJoues = 0
  let pli: { siege: number; carte: Card }[] = []
  for (const p of donne.plis) {
    for (const { player, card } of p.cartes) {
      if (p.numero === numeroPli && player === joueur) {
        let meilleur: { carte: Card; v: number } | null = null
        const s = siege(player)
        for (const essai of permis) {
          const m2 = mains.map((m, i) => (i === s ? m.filter((x) => x !== essai) : m))
          const pli2 = [...pli, { siege: s, carte: essai }]
          // Même position pour tous les essais : ce qui reste à gagner suffit à les comparer.
          const v = resoudre({ mains: m2, pli: pli2, entameur, plisJoues, trump, equipe, objectif })
          if (!meilleur || v > meilleur.v) meilleur = { carte: essai, v }
        }
        return meilleur?.carte ?? null
      }
      const s = siege(player)
      mains[s] = mains[s].filter((x) => x !== card)
      pli = [...pli, { siege: s, carte: card }]
      if (pli.length === 4) {
        pli = []
        entameur = siege(p.gagnant)
        plisJoues += 1
      }
    }
  }
  return null
}
