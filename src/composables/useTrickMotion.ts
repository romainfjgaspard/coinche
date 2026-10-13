/**
 * Le mouvement des cartes du pli : chaque carte part du joueur qui la pose et glisse
 * jusqu'à sa place sur le tapis ; le pli ramassé file vers celui qui le remporte.
 * Rapide, mais assez lent pour que l'œil suive — les cartes apparaissaient d'un coup.
 *
 * Les tables donnent, pour chaque place, le vecteur qui va de la carte posée au joueur
 * (`origins`) : l'aller part de là, et le ramassage y retourne, côté gagnant.
 */
import { type ComputedRef, ref, watch } from 'vue'
import type { Spot } from './useTableState'
import { useTableState } from './useTableState'

export interface Vector {
  x: number
  y: number
}

/** Durées, en millisecondes. */
export const PLAY_MS = 380
export const GATHER_MS = 480

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * `origins` : de chaque carte posée vers son joueur ; `spots` : le centre de chaque carte
 * posée, dans un même repère.
 */
export function useTrickMotion(
  origins: ComputedRef<Record<Spot, Vector>>,
  spots: ComputedRef<Record<Spot, Vector>>,
) {
  const { winnerSpot } = useTableState()

  /**
   * Le gagnant du pli, retenu au-delà du ramassage : quand les cartes quittent le tapis,
   * le pli n'a déjà plus de gagnant dans l'état de la table.
   */
  const lastWinner = ref<Spot | null>(null)
  watch(winnerSpot, (w) => {
    if (w) lastWinner.value = w
  })

  /** La carte arrive de la main de son joueur. */
  const enter = (spot: Spot) => (el: Element, done: () => void) => {
    if (reducedMotion()) return done()
    const o = origins.value[spot]
    const a = (el as HTMLElement).animate(
      [
        { transform: `translate(${o.x}px, ${o.y}px) scale(.82)`, opacity: 0.6 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration: PLAY_MS, easing: 'cubic-bezier(.2,.75,.3,1)' },
    )
    a.onfinish = () => done()
    a.oncancel = () => done()
  }

  /**
   * Le pli ramassé part vers le gagnant : chaque carte rejoint la place du gagnant sur
   * le tapis, puis continue vers lui en s'effaçant.
   */
  const leave = (spot: Spot) => (el: Element, done: () => void) => {
    const w = lastWinner.value
    if (reducedMotion() || !w) return done()
    const to = {
      x: spots.value[w].x - spots.value[spot].x + origins.value[w].x * 0.8,
      y: spots.value[w].y - spots.value[spot].y + origins.value[w].y * 0.8,
    }
    const a = (el as HTMLElement).animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(.7)`, opacity: 0 },
      ],
      { duration: GATHER_MS, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' },
    )
    a.onfinish = () => done()
    a.oncancel = () => done()
  }

  return { enter, leave }
}
