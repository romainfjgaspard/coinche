<script setup lang="ts">
/**
 * Les temps de réflexion en distribution : un graphe pour annoncer, un pour jouer une
 * carte, une courbe par joueur et sa moyenne en pointillé. Les pauses n'y sont pas.
 */
import { computed } from 'vue'
import type { PlayerId } from '../game/players'
import { BORNES_TEMPS, type Temps, histogramme, labelTemps, moyenneDe } from '../game/statsEncheres'
import { nomDe } from '../stores/roster'
import CourbesDistribution, { type SerieCourbe } from './CourbesDistribution.vue'

const props = defineProps<{
  joueurs: PlayerId[]
  couleurs: Record<PlayerId, string>
  temps: Map<PlayerId, Temps>
}>()

const categories = histogramme([], BORNES_TEMPS, labelTemps).map((t) => `${t.label} s`)
/** Tranches de largeurs inégales : la moyenne se place par interpolation dans la sienne. */
function position(v: number): number {
  for (let i = 0; i < BORNES_TEMPS.length; i++) {
    const a = BORNES_TEMPS[i]
    const b = BORNES_TEMPS[i + 1] ?? a * 2
    if (v < b || i === BORNES_TEMPS.length - 1) {
      return Math.min(BORNES_TEMPS.length - 1, Math.max(0, i - 0.5 + (v - a) / (b - a)))
    }
  }
  return 0
}
const secondes = (v: number | null): string =>
  v === null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`

function series(quoi: 'encheres' | 'cartes'): SerieCourbe[] {
  return props.joueurs
    .filter((p) => (props.temps.get(p)?.[quoi].length ?? 0) > 0)
    .map((p) => {
      const v = props.temps.get(p)![quoi]
      const moy = moyenneDe(v)
      return {
        id: p,
        nom: nomDe(p),
        couleur: props.couleurs[p],
        valeurs: histogramme(v, BORNES_TEMPS, labelTemps).map((t) => t.part),
        moyenne: moy === null ? null : position(moy),
        note: `moy. ${secondes(moy)}`,
      }
    })
}
const annonces = computed(() => series('encheres'))
const cartes = computed(() => series('cartes'))
</script>

<template>
  <section>
    <h2 class="mt-6 text-[13px] font-semibold lg:text-[15px]">Temps pour annoncer</h2>
    <p class="mb-2 text-xs text-sage">
      Part de ses enchères selon le temps pris ; la coinche, hors tour, n'y est pas.
    </p>
    <CourbesDistribution
      :series="annonces"
      :categories="categories"
      vide="Aucun temps mesuré pour l'instant."
    />
  </section>
  <section>
    <h2 class="mt-6 text-[13px] font-semibold lg:text-[15px]">Temps pour jouer</h2>
    <p class="mb-2 text-xs text-sage">
      Part de ses cartes selon le temps pris ; la dernière carte, jouée d'office, n'y est pas.
    </p>
    <CourbesDistribution
      :series="cartes"
      :categories="categories"
      vide="Aucun temps mesuré pour l'instant."
    />
  </section>
</template>
