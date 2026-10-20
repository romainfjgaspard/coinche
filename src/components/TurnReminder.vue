<script setup lang="ts">
/**
 * Le rappel au milieu de la table, qui clignote quand un joueur tarde : « Roux, à toi de
 * jouer ». Tout le monde le voit, le retardataire aussi.
 *
 * Seuils tirés des parties du 13/10/2026 (temps de réflexion relevés dans le journal) :
 * une carte se joue en 2 à 4 s en médiane, et rarement au-delà de 10 s (6 à 12 % des
 * cartes, 22 % pour le plus lent) ; une annonce prend 7 à 15 s en médiane, d'où un seuil
 * plus long, 20 s, pour ne pas rappeler à l'ordre une annonce sur deux.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'
import { REMINDER_BID_MS, REMINDER_CARD_MS } from '../game/display'

const session = useSession()

/** Qui doit agir, et quoi : jouer une carte ou annoncer. */
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
</script>

<template>
  <div
    v-if="shown && awaited"
    role="status"
    class="pointer-events-none absolute inset-x-0 top-[38%] z-[35] flex justify-center px-6"
  >
    <p
      class="reminder rounded-2xl px-5 py-3 text-center font-display text-[26px] leading-tight shadow-[0_10px_30px_rgba(0,0,0,.55)] lg:text-4xl"
      :class="mine ? 'bg-gold text-felt' : 'border border-gold/60 bg-felt-dark/95 text-gold'"
    >
      {{ text }}
    </p>
  </div>
</template>

<style scoped>
/* Un clignotement franc mais doux : visible du coin de l'œil, sans agresser */
.reminder {
  animation: reminder 1.1s ease-in-out infinite;
}
@keyframes reminder {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.97);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reminder {
    animation: none;
  }
}
</style>
