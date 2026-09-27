/**
 * Ce que la table montre, vu depuis mon siège : qui est où, le pli sur le tapis,
 * le contrat, ce que je peux jouer. Partagé par la table du téléphone et celle du PC,
 * qui ne diffèrent que par la mise en page.
 */
import { computed } from 'vue'
import type { Card } from '../game/cards'
import { HAND_SIZE } from '../game/deal'
import { type PlayerId, playerAtSeat, seatOf } from '../game/players'
import type { Declaration } from '../game/bidding'
import { currentDeal } from '../game/replay'
import { useSession } from '../stores/session'

export type Spot = 'me' | 'left' | 'top' | 'right'

/** La dernière parole d'un joueur pendant les enchères, à côté de son nom. */
export interface LastBid {
  /** « 90 », « Capot », « Passe », « Coinche » — sans le symbole */
  text: string
  /** L'atout annoncé, affiché à part en couleur ; sans objet pour une passe ou une coinche */
  suit: Declaration | null
  pass: boolean
  coinche: boolean
}

export function useTableState() {
  const session = useSession()

  const me = computed<PlayerId>(() => session.playerId ?? 'romain')
  const around = computed(() => {
    const spots = session.seating
    const mySeat = seatOf(me.value, spots)
    return {
      left: playerAtSeat(mySeat + 1, spots),
      top: playerAtSeat(mySeat + 2, spots),
      right: playerAtSeat(mySeat + 3, spots),
    }
  })

  /** Cartes restantes d'un adversaire : ce qu'il n'a pas encore posé. */
  function remaining(player: PlayerId): number {
    const st = session.play
    if (!st) return HAND_SIZE
    const played = [...st.completed.flatMap((t) => t.plays), ...st.current].filter(
      (p) => p.player === player,
    ).length
    return HAND_SIZE - played
  }

  const contract = computed(() => {
    const r = session.biddingResult
    return r && r.status === 'contract' ? r : null
  })
  /** « 100 », « Capot », « Générale » : un capot ne se lit pas comme un 250. */
  const contractLabel = computed(() => {
    const c = contract.value
    if (!c) return ''
    return c.generale ? 'Générale' : c.capot ? 'Capot' : String(c.value)
  })

  /**
   * Le pli montré sur le tapis, rangé par position autour de la table : le pli en
   * cours, ou celui qui vient d'être ramassé, le temps qu'on voie qui l'emporte.
   */
  const trickAt = computed(() => {
    const map: Partial<Record<Spot, Card>> = {}
    for (const p of session.shownTrick.plays) {
      if (p.player === me.value) map.me = p.card
      else if (p.player === around.value.left) map.left = p.card
      else if (p.player === around.value.top) map.top = p.card
      else if (p.player === around.value.right) map.right = p.card
    }
    return map
  })
  /** Ordre de pose, pour que la dernière carte jouée passe au-dessus des autres. */
  const trickOrder = computed(() => {
    const order: Partial<Record<Spot, number>> = {}
    session.shownTrick.plays.forEach((p, i) => {
      const spot: Spot =
        p.player === me.value
          ? 'me'
          : p.player === around.value.left
            ? 'left'
            : p.player === around.value.top
              ? 'top'
              : 'right'
      order[spot] = i
    })
    return order
  })
  const trickWinnerCard = computed(
    () => session.shownTrick.plays.find((p) => p.player === session.shownTrick.winner)?.card ?? null,
  )

  const isTrump = (card: Card): boolean => {
    // Pendant les enchères il n'y a pas d'atout : sans cette garde, `endsWith('')`
    // marquerait toute la main.
    const trump = contract.value?.trump
    return trump != null && card.endsWith(trump)
  }

  const canPlay = (card: Card): boolean => session.myPlayTurn && session.playable.includes(card)

  const starsOf = (p: PlayerId): number => session.stars.get(p) ?? 0

  /** Qui doit agir maintenant, pour mettre sa pastille en évidence. */
  const isActive = (p: PlayerId): boolean => session.toPlay === p || session.toBid === p

  /**
   * Pendant les enchères, la dernière parole de chacun, à côté de son nom autour de la
   * table : l'historique complet reste dans le panneau, mais on lit d'un coup d'œil où
   * en est chacun. Une coinche l'emporte sur l'annonce qui la précède.
   */
  const lastBid = computed(() => {
    const out = new Map<PlayerId, LastBid>()
    if (session.game?.phase !== 'bidding') return out
    for (const e of currentDeal(session.events)) {
      if (e.type === 'coinche' || e.type === 'surcoinche') {
        out.set(e.player, {
          text: e.type === 'coinche' ? 'Coinche' : 'Surcoinche',
          suit: null,
          pass: false,
          coinche: true,
        })
      } else if (e.type === 'bid') {
        const b = e.entry
        // Le symbole à part : il s'affiche en couleur sur un rond ivoire, comme le contrat.
        const suit =
          b.kind === 'contract' ? b.suit : b.kind === 'capot' || b.kind === 'generale' ? b.declaration : null
        const text =
          b.kind === 'pass'
            ? 'Passe'
            : b.kind === 'contract'
              ? String(b.value)
              : b.kind === 'capot'
                ? 'Capot'
                : b.kind === 'generale'
                  ? 'Générale'
                  : ''
        if (text) out.set(e.player, { text, suit, pass: b.kind === 'pass', coinche: false })
      }
    }
    return out
  })

  /**
   * BEL-2 / BEL-6 — la belote annoncée se voit à côté du nom, pour tous. Elle
   * disparaît si la seconde tête est posée sans rebelote : la belote est alors perdue.
   */
  function beloteOf(p: PlayerId): 'belote' | 'rebelote' | null {
    const st = session.play
    const trump = contract.value?.trump
    if (!st || session.game?.phase !== 'playing' || !trump) return null
    const n = session.beloteCalls.get(p) ?? 0
    if (n >= 2) return 'rebelote'
    if (n === 0) return null
    const placedCards = [...st.completed.flatMap((t) => t.plays), ...st.current].filter(
      (x) => x.player === p && (x.card === `K${trump}` || x.card === `Q${trump}`),
    ).length
    return placedCards >= 2 ? null : 'belote'
  }

  return {
    session,
    me,
    around,
    remaining,
    contract,
    contractLabel,
    trickAt,
    trickOrder,
    trickWinnerCard,
    isTrump,
    canPlay,
    starsOf,
    isActive,
    lastBid,
    beloteOf,
  }
}
