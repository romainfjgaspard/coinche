<script setup lang="ts">
/**
 * Le dernier pli en croix, chaque carte à la place de celui qui l'a jouée — moi en
 * bas, mon partenaire en haut, les adversaires sur les côtés — comme sur le tapis.
 * En ligne, on ne savait plus qui avait joué quoi.
 */
import { computed } from 'vue'
import type { CompletedTrick } from '../game/play'
import { useTableState } from '../composables/useTableState'
import PlayingCard from './PlayingCard.vue'

const props = defineProps<{ trick: CompletedTrick; width: number }>()
const { me, around } = useTableState()

const h = computed(() => Math.round(props.width * 1.44))
const cartes = computed(() =>
  props.trick.plays.map((p) => {
    const w = props.width
    // Les côtés se glissent entre le haut et le bas : la croix reste compacte.
    const place =
      p.player === me.value ? { left: w, top: Math.round(h.value * 0.9) }
        : p.player === around.value.top ? { left: w, top: 0 }
          : p.player === around.value.left ? { left: 0, top: Math.round(h.value * 0.45) }
            : { left: 2 * w, top: Math.round(h.value * 0.45) }
    return { ...p, ...place }
  }),
)
</script>

<template>
  <div class="relative" :style="{ width: `${width * 3}px`, height: `${Math.round(h * 1.9)}px` }">
    <div
      v-for="c in cartes"
      :key="c.card"
      class="absolute"
      :style="{ left: `${c.left}px`, top: `${c.top}px` }"
    >
      <PlayingCard :card="c.card" :width="width" :winner="c.player === trick.winner" />
    </div>
  </div>
</template>
