<script setup lang="ts">
/**
 * Le rappel au milieu de la table, qui clignote quand un joueur tarde : « Roux, à toi de
 * jouer ». Tout le monde le voit, le retardataire aussi.
 *
 * Sur PC, quand c'est à moi d'annoncer, le panneau « Ton enchère » occupe le milieu du
 * tapis et cachait le rappel : c'est alors le panneau qui clignote (`besidePanel`).
 */
import { computed } from 'vue'
import { useTurnReminder } from '../composables/useTurnReminder'

const props = defineProps<{ besidePanel?: boolean }>()

const { awaited, shown, mine, text } = useTurnReminder()
const visible = computed(
  () => shown.value && awaited.value !== null && !(props.besidePanel && mine.value && awaited.value.bid),
)
</script>

<template>
  <div
    v-if="visible"
    role="status"
    class="pointer-events-none absolute inset-x-0 top-[38%] z-[35] flex justify-center px-6"
  >
    <p
      class="turn-reminder rounded-2xl px-5 py-3 text-center font-display text-[26px] leading-tight shadow-[0_10px_30px_rgba(0,0,0,.55)] lg:text-4xl"
      :class="mine ? 'bg-gold text-felt' : 'border border-gold/60 bg-felt-dark/95 text-gold'"
    >
      {{ text }}
    </p>
  </div>
</template>
