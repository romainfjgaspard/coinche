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
/** L'espace entre deux cartes : collées, elles se confondaient. */
const gap = computed(() => Math.max(3, Math.round(props.width * 0.1)))
const cartes = computed(() =>
  props.trick.plays.map((p) => {
    const w = props.width
    const g = gap.value
    // Haut et bas l'un au-dessus de l'autre, les côtés à mi-hauteur entre les deux.
    const milieu = Math.round((h.value + g) / 2)
    const place =
      p.player === me.value
        ? { left: w + g, top: h.value + g }
        : p.player === around.value.top
          ? { left: w + g, top: 0 }
          : p.player === around.value.left
            ? { left: 0, top: milieu }
            : { left: 2 * (w + g), top: milieu }
    return { ...p, ...place }
  }),
)
</script>

<template>
  <div class="relative" :style="{ width: `${width * 3 + 2 * gap}px`, height: `${2 * h + gap}px` }">
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
