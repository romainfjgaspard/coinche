<script setup lang="ts">
/**
 * Points faits comparés à l'annonce, pour le preneur : de combien il dépasse quand il
 * réussit, de combien il manque quand il chute. Un tableau, et la distribution en courbes.
 */
import { computed } from 'vue'
import type { PlayerId } from '../game/players'
import { GAP_BOUNDS, type Gaps, histogram, gapLabel, averageOf } from '../game/statsBidding'
import { nameOf } from '../stores/roster'
import DistributionCurves, { type CurveSeries } from './DistributionCurves.vue'

const props = defineProps<{
  players: PlayerId[]
  colors: Record<PlayerId, string>
  gaps: Map<PlayerId, Gaps>
}>()

const signed = (v: number | null): string => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`)
const rows = computed(() =>
  props.players
    .map((p) => ({ p, e: props.gaps.get(p) }))
    .filter((x): x is { p: PlayerId; e: Gaps } => Boolean(x.e && x.e.madeGaps.length + x.e.downs.length > 0)),
)
const categories = computed(() => histogram([], GAP_BOUNDS, gapLabel).map((t) => t.label))
/** Tranches de 10 centrées : « +0 » va de 0 à 9, son centre est à l'indice de la tranche. */
const position = (v: number): number => Math.min(GAP_BOUNDS.length - 1, Math.max(0, (v + 45) / 10))
const series = computed<CurveSeries[]>(() =>
  rows.value.map(({ p, e }) => {
    const everyone = [...e.madeGaps, ...e.downs]
    const avg = averageOf(everyone)
    return {
      id: p,
      name: nameOf(p),
      color: props.colors[p],
      values: histogram(everyone, GAP_BOUNDS, gapLabel).map((t) => t.share),
      average: avg === null ? null : position(avg),
      note: `moy. ${signed(avg)}`,
    }
  }),
)
</script>

<template>
  <section>
    <h2 class="mt-6 text-[15px] font-semibold lg:text-[15px]">Écart à l'annonce</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Points faits par le preneur (cartes, dix de der, belote) moins son annonce. Capots et générales à part.
    </p>
    <p v-if="!rows.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
      Aucun contrat joué pour l'instant.
    </p>
    <template v-else>
      <table class="w-full border-collapse text-[15px] lg:text-[13px] tabular-nums">
        <thead>
          <tr class="text-[13px] lg:text-xs text-sage">
            <th class="pb-1 text-left font-semibold">Preneur</th>
            <th class="pb-1 text-right font-semibold">Réussis</th>
            <th class="pb-1 text-right font-semibold">Chutés</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ p, e } in rows" :key="p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :style="{ color: colors[p] }">{{ nameOf(p) }}</td>
            <td class="py-1.5 text-right">
              {{ signed(averageOf(e.madeGaps)) }}
              <span class="text-[13px] lg:text-[11px] text-dusk">({{ e.madeGaps.length }})</span>
            </td>
            <td class="py-1.5 text-right">
              {{ signed(averageOf(e.downs)) }}
              <span class="text-[13px] lg:text-[11px] text-dusk">({{ e.downs.length }})</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[13px] lg:text-[11px] text-dusk">Écart moyen (nombre de contrats).</p>
      <div class="mt-3">
        <DistributionCurves :series="series" :categories="categories" />
      </div>
    </template>
  </section>
</template>
