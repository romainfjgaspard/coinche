/**
 * Ce que la table montre, vu depuis mon siège : qui est où, le pli sur le tapis,
 * le contrat, ce que je peux jouer. Partagé par la table du téléphone et celle du PC,
 * qui ne diffèrent que par la mise en page.
 */
import { computed } from 'vue'
import type { Card } from '../game/cards'
import { HAND_SIZE } from '../game/deal'
import { type PlayerId, playerAtSeat, seatOf } from '../game/players'
import { useSession } from '../stores/session'

export type Place = 'me' | 'left' | 'top' | 'right'

export function useTableState() {
  const session = useSession()

  const me = computed<PlayerId>(() => session.playerId ?? 'romain')
  const around = computed(() => {
    const places = session.seating
    const moi = seatOf(me.value, places)
    return {
      left: playerAtSeat(moi + 1, places),
      top: playerAtSeat(moi + 2, places),
      right: playerAtSeat(moi + 3, places),
    }
  })

  /** Cartes restantes d'un adversaire : ce qu'il n'a pas encore posé. */
  function remaining(player: PlayerId): number {
    const st = session.play
    if (!st) return HAND_SIZE
    const played = [...st.completed.flatMap((t) => t.plays), ...st.current]
      .filter((p) => p.player === player).length
    return HAND_SIZE - played
  }

  const contract = computed(() => {
    const r = session.biddingResult
    return r && r.status === 'contrat' ? r : null
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
    const map: Partial<Record<Place, Card>> = {}
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
    const order: Partial<Record<Place, number>> = {}
    session.shownTrick.plays.forEach((p, i) => {
      const place: Place = p.player === me.value ? 'me'
        : p.player === around.value.left ? 'left'
          : p.player === around.value.top ? 'top' : 'right'
      order[place] = i
    })
    return order
  })
  const trickWinnerCard = computed(() =>
    session.shownTrick.plays.find((p) => p.player === session.shownTrick.winner)?.card ?? null,
  )

  const isTrump = (card: Card): boolean => {
    // Pendant les enchères il n'y a pas d'atout : sans cette garde, `endsWith('')`
    // marquerait toute la main.
    const trump = contract.value?.trump
    return trump != null && card.endsWith(trump)
  }

  const canPlay = (card: Card): boolean =>
    session.myPlayTurn && session.playable.includes(card)

  const starsOf = (p: PlayerId): number => session.stars.get(p) ?? 0

  /** Qui doit agir maintenant, pour mettre sa pastille en évidence. */
  const isActive = (p: PlayerId): boolean => session.toPlay === p || session.toBid === p

  return {
    session, me, around, remaining, contract, contractLabel,
    trickAt, trickOrder, trickWinnerCard, isTrump, canPlay, starsOf, isActive,
  }
}
