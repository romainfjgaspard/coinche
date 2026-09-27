<script setup lang="ts">
/**
 * Les temps de réflexion en distribution : un graphe pour annoncer, un pour jouer une
 * carte, une courbe par joueur et sa moyenne en pointillé. Les pauses n'y sont pas.
 */
import { computed } from 'vue'
import type { PlayerId } from '../game/players'
import { TIME_BOUNDS, type Times, histogram, timeLabel, averageOf } from '../game/statsBidding'
import { nameOf } from '../stores/roster'
import DistributionCurves, { type CurveSeries } from './DistributionCurves.vue'

const props = defineProps<{
  players: PlayerId[]
  colors: Record<PlayerId, string>
  times: Map<PlayerId, Times>
}>()

const categories = histogram([], TIME_BOUNDS, timeLabel).map((t) => `${t.label} s`)
/** Tranches de largeurs inégales : la moyenne se place par interpolation dans la sienne. */
function position(v: number): number {
  for (let i = 0; i < TIME_BOUNDS.length; i++) {
    const a = TIME_BOUNDS[i]
    const b = TIME_BOUNDS[i + 1] ?? a * 2
    if (v < b || i === TIME_BOUNDS.length - 1) {
      return Math.min(TIME_BOUNDS.length - 1, Math.max(0, i - 0.5 + (v - a) / (b - a)))
    }
  }
  return 0
}
const seconds = (v: number | null): string =>
  v === null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`

function series(what: 'bids' | 'cards'): CurveSeries[] {
  return props.players
    .filter((p) => (props.times.get(p)?.[what].length ?? 0) > 0)
    .map((p) => {
      const v = props.times.get(p)![what]
      const avg = averageOf(v)
      return {
        id: p,
        name: nameOf(p),
        color: props.colors[p],
        values: histogram(v, TIME_BOUNDS, timeLabel).map((t) => t.share),
        average: avg === null ? null : position(avg),
        note: `moy. ${seconds(avg)}`,
      }
    })
}
const calls = computed(() => series('bids'))
const cards = computed(() => series('cards'))
</script>

<template>
  <section>
    <h2 class="mt-6 text-[15px] font-semibold lg:text-[15px]">Temps pour annoncer</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Part de ses enchères selon le temps pris ; la coinche, hors tour, n'y est pas.
    </p>
    <DistributionCurves :series="calls" :categories="categories" empty="Aucun temps mesuré pour l'instant." />
  </section>
  <section>
    <h2 class="mt-6 text-[15px] font-semibold lg:text-[15px]">Temps pour jouer</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Part de ses cartes selon le temps pris ; la dernière carte, jouée d'office, n'y est pas.
    </p>
    <DistributionCurves :series="cards" :categories="categories" empty="Aucun temps mesuré pour l'instant." />
  </section>
</template>
