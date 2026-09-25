<script setup lang="ts">
/**
 * Points faits comparés à l'annonce, pour le preneur : de combien il dépasse quand il
 * réussit, de combien il manque quand il chute. Un tableau, et la distribution en courbes.
 */
import { computed } from 'vue'
import type { PlayerId } from '../game/players'
import { BORNES_ECART, type Ecarts, histogramme, labelEcart, moyenneDe } from '../game/statsEncheres'
import { nomDe } from '../stores/roster'
import CourbesDistribution, { type SerieCourbe } from './CourbesDistribution.vue'

const props = defineProps<{
  joueurs: PlayerId[]
  couleurs: Record<PlayerId, string>
  ecarts: Map<PlayerId, Ecarts>
}>()

const signe = (v: number | null): string => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`)
const lignes = computed(() =>
  props.joueurs
    .map((p) => ({ p, e: props.ecarts.get(p) }))
    .filter((x): x is { p: PlayerId; e: Ecarts } =>
      Boolean(x.e && x.e.reussis.length + x.e.chutes.length > 0),
    ),
)
const categories = computed(() => histogramme([], BORNES_ECART, labelEcart).map((t) => t.label))
/** Tranches de 10 centrées : « +0 » va de 0 à 9, son centre est à l'indice de la tranche. */
const position = (v: number): number => Math.min(BORNES_ECART.length - 1, Math.max(0, (v + 45) / 10))
const series = computed<SerieCourbe[]>(() =>
  lignes.value.map(({ p, e }) => {
    const tous = [...e.reussis, ...e.chutes]
    const moy = moyenneDe(tous)
    return {
      id: p,
      nom: nomDe(p),
      couleur: props.couleurs[p],
      valeurs: histogramme(tous, BORNES_ECART, labelEcart).map((t) => t.part),
      moyenne: moy === null ? null : position(moy),
      note: `moy. ${signe(moy)}`,
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
    <p v-if="!lignes.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
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
          <tr v-for="{ p, e } in lignes" :key="p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :style="{ color: couleurs[p] }">{{ nomDe(p) }}</td>
            <td class="py-1.5 text-right">
              {{ signe(moyenneDe(e.reussis)) }}
              <span class="text-[13px] lg:text-[11px] text-dusk">({{ e.reussis.length }})</span>
            </td>
            <td class="py-1.5 text-right">
              {{ signe(moyenneDe(e.chutes)) }}
              <span class="text-[13px] lg:text-[11px] text-dusk">({{ e.chutes.length }})</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[13px] lg:text-[11px] text-dusk">Écart moyen (nombre de contrats).</p>
      <div class="mt-3">
        <CourbesDistribution :series="series" :categories="categories" />
      </div>
    </template>
  </section>
</template>
