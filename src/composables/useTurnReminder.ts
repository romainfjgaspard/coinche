/**
 * Le rappel quand un joueur tarde : qui doit agir, et s'il est temps de le lui rappeler.
 *
 * Seuils tirés des parties du 13/10/2026 (temps de réflexion relevés dans le journal) :
 * une carte se joue en 2 à 4 s en médiane, et rarement au-delà de 10 s (6 à 12 % des
 * cartes, 22 % pour le plus lent) ; une annonce prend 7 à 15 s en médiane, d'où un seuil
 * plus long. Le 21/10, la table a demandé de doubler les deux : 20 s et 40 s.
 */
import { type ComputedRef, type Ref, computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'
import { REMINDER_BID_MS, REMINDER_CARD_MS } from '../game/display'

export interface TurnReminder {
  /** Qui doit agir, et quoi : jouer une carte ou annoncer. */
  awaited: ComputedRef<{ player: string; bid: boolean } | null>
  /** Le seuil est dépassé : il est temps de clignoter. */
  shown: Ref<boolean>
  /** C'est à moi d'agir. */
  mine: ComputedRef<boolean>
  text: ComputedRef<string>
}

export function useTurnReminder(): TurnReminder {
  const session = useSession()

  const awaited = computed<{ player: string; bid: boolean } | null>(() => {
    if (session.pause) return null
    if (session.game?.phase === 'playing' && session.toPlay && !session.heldTrick)
      return { player: session.toPlay, bid: false }
    if (session.game?.phase === 'bidding' && session.toBid) return { player: session.toBid, bid: true }
    return null
  })

  const shown = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  // Le compte repart à chaque coup : une nouvelle carte, une nouvelle annonce, une pause.
  watch(
    () => (awaited.value ? `${awaited.value.player}|${awaited.value.bid}|${session.events.length}` : ''),
    (key) => {
      clearTimeout(timer)
      shown.value = false
      if (!key || !awaited.value) return
      timer = setTimeout(() => (shown.value = true), awaited.value.bid ? REMINDER_BID_MS : REMINDER_CARD_MS)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))

  const mine = computed(() => awaited.value?.player === session.playerId)
  const text = computed(() => {
    const a = awaited.value
    if (!a) return ''
    const what = a.bid ? 'parler' : 'jouer'
    return mine.value ? `À toi de ${what} !` : `${nameOf(a.player)}, à toi de ${what} !`
  })

  return { awaited, shown, mine, text }
}
