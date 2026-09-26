<script setup lang="ts">
/**
 * Les enchères de chacun : la répartition de ses annonces (une courbe par joueur sur
 * l'échelle 80 → 170, capot, générale ; la passe à part, en légende), et qui lance ou
 * suit la couleur quand son équipe prend. Sert à la partie et à toutes les parties.
 */
import { computed, ref } from 'vue'
import type { PlayerId } from '../game/players'
import {
  BID_CATEGORIES,
  BID_LABEL,
  BID_LEVELS,
  type BidDistribution,
  type Roles,
  averageBidOf,
} from '../game/statsBidding'
import { nameOf } from '../stores/roster'
import DistributionCurves, { type CurveSeries } from './DistributionCurves.vue'

const props = defineProps<{
  players: PlayerId[]
  colors: Record<PlayerId, string>
  calls: Map<PlayerId, BidDistribution>
  roles: Map<PlayerId, Roles>
}>()

const detail = ref(false)

const total = (r: BidDistribution): number => BID_CATEGORIES.reduce((s, c) => s + (r[c] ?? 0), 0)
const numbered = (r: BidDistribution): number => BID_LEVELS.reduce((s, c) => s + (r[c] ?? 0), 0)

const series = computed<CurveSeries[]>(() =>
  props.players
    .filter((p) => numbered(props.calls.get(p) ?? {}) > 0)
    .map((p) => {
      const r = props.calls.get(p)!
      const n = numbered(r)
      const avg = averageBidOf(r)
      const pass = total(r) ? Math.round((100 * (r.pass ?? 0)) / total(r)) : 0
      return {
        id: p,
        name: nameOf(p),
        color: props.colors[p],
        values: BID_LEVELS.map((c) => (100 * (r[c] ?? 0)) / n),
        // Les paliers sont espacés de 10 : 80 à l'indice 0, 170 à l'indice 9.
        average: avg === null ? null : (avg - 80) / 10,
        note: `passe ${pass} %${avg === null ? '' : ` · moy. ${Math.round(avg)}`}`,
      }
    }),
)

const roleRows = computed(() =>
  props.players
    .map((p) => ({ p, r: props.roles.get(p) }))
    .filter((x): x is { p: PlayerId; r: Roles } => Boolean(x.r && x.r.opener + x.r.follower + x.r.alone > 0)),
)
const pct = (k: number, r: Roles): string => {
  const n = r.opener + r.follower + r.alone
  return n && k ? `${Math.round((100 * k) / n)} %` : ''
}
</script>

<template>
  <section>
    <h2 class="mt-5 text-[15px] font-semibold lg:text-[15px]">Répartition des annonces</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Chaque prise de parole, pas seulement l'annonce finale. En % de ses annonces chiffrées ; la passe à
      part.
    </p>
    <DistributionCurves
      :series="series"
      :categories="BID_LEVELS.map((c) => BID_LABEL[c])"
      empty="Aucune annonce pour l'instant."
    />
    <button
      v-if="series.length"
      type="button"
      class="mt-2 cursor-pointer text-[13px] lg:text-xs text-sage underline underline-offset-4 hover:text-mist"
      @click="detail = !detail"
    >
      {{ detail ? 'Masquer le détail' : 'Voir le détail ▼' }}
    </button>
    <div v-if="detail" class="mt-2 overflow-x-auto">
      <table class="w-full border-collapse text-[13px] tabular-nums lg:text-xs">
        <thead>
          <tr class="text-sage">
            <th class="pr-2 pb-1 text-left font-semibold">Joueur</th>
            <th v-for="c in BID_CATEGORIES" :key="c" class="px-1 pb-1 text-right font-semibold">
              {{ BID_LABEL[c] }}
            </th>
            <th class="pl-2 pb-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in players.filter((j) => calls.get(j))" :key="p" class="border-t border-white/8">
            <td class="py-1 pr-2 font-semibold whitespace-nowrap" :style="{ color: colors[p] }">
              {{ nameOf(p) }}
            </td>
            <td v-for="c in BID_CATEGORIES" :key="c" class="px-1 py-1 text-right text-mist">
              {{ calls.get(p)![c] ?? '' }}
            </td>
            <td class="py-1 pl-2 text-right font-semibold">{{ total(calls.get(p)!) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2 class="mt-6 text-[15px] font-semibold lg:text-[15px]">Lanceur, suiveur ou seul</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Quand son équipe a le contrat : a-t-il ouvert la couleur, monté sur son partenaire, ou pris seul ?
    </p>
    <p v-if="!roleRows.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
      Aucun contrat pour l'instant.
    </p>
    <table v-else class="w-full border-collapse text-[15px] lg:text-[13px] tabular-nums">
      <thead>
        <tr class="text-[13px] lg:text-xs text-sage">
          <th class="pb-1 text-left font-semibold">Joueur</th>
          <th class="pb-1 text-right font-semibold">Lanceur</th>
          <th class="pb-1 text-right font-semibold">Suiveur</th>
          <th class="pb-1 text-right font-semibold">Seul</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="{ p, r } in roleRows" :key="p" class="border-t border-white/8">
          <td class="py-1.5 font-semibold" :style="{ color: colors[p] }">{{ nameOf(p) }}</td>
          <td class="py-1.5 text-right">
            {{ r.opener }} <span class="text-[13px] lg:text-[11px] text-dusk">{{ pct(r.opener, r) }}</span>
          </td>
          <td class="py-1.5 text-right">
            {{ r.follower }}
            <span class="text-[13px] lg:text-[11px] text-dusk">{{ pct(r.follower, r) }}</span>
          </td>
          <td class="py-1.5 text-right">
            {{ r.alone }} <span class="text-[13px] lg:text-[11px] text-dusk">{{ pct(r.alone, r) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
