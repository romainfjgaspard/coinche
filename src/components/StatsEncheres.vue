<script setup lang="ts">
/**
 * Les enchères de chacun : la répartition de ses annonces (une courbe par joueur sur
 * l'échelle 80 → 170, capot, générale ; la passe à part, en légende), et qui lance ou
 * suit la couleur quand son équipe prend. Sert à la partie et à toutes les parties.
 */
import { computed, ref } from 'vue'
import type { PlayerId } from '../game/players'
import {
  CATEGORIES_ANNONCE,
  LIBELLE_ANNONCE,
  PALIERS,
  type Repartition,
  type Roles,
  enchereMoyenneDe,
} from '../game/statsEncheres'
import { nomDe } from '../stores/roster'
import CourbesDistribution, { type SerieCourbe } from './CourbesDistribution.vue'

const props = defineProps<{
  joueurs: PlayerId[]
  couleurs: Record<PlayerId, string>
  annonces: Map<PlayerId, Repartition>
  roles: Map<PlayerId, Roles>
}>()

const detail = ref(false)

const total = (r: Repartition): number => CATEGORIES_ANNONCE.reduce((s, c) => s + (r[c] ?? 0), 0)
const chiffrees = (r: Repartition): number => PALIERS.reduce((s, c) => s + (r[c] ?? 0), 0)

const series = computed<SerieCourbe[]>(() =>
  props.joueurs
    .filter((p) => chiffrees(props.annonces.get(p) ?? {}) > 0)
    .map((p) => {
      const r = props.annonces.get(p)!
      const n = chiffrees(r)
      const moy = enchereMoyenneDe(r)
      const passe = total(r) ? Math.round((100 * (r.passe ?? 0)) / total(r)) : 0
      return {
        id: p,
        nom: nomDe(p),
        couleur: props.couleurs[p],
        valeurs: PALIERS.map((c) => (100 * (r[c] ?? 0)) / n),
        // Les paliers sont espacés de 10 : 80 à l'indice 0, 170 à l'indice 9.
        moyenne: moy === null ? null : (moy - 80) / 10,
        note: `passe ${passe} %${moy === null ? '' : ` · moy. ${Math.round(moy)}`}`,
      }
    }),
)

const lignesRoles = computed(() =>
  props.joueurs
    .map((p) => ({ p, r: props.roles.get(p) }))
    .filter((x): x is { p: PlayerId; r: Roles } => Boolean(x.r && x.r.lanceur + x.r.suiveur + x.r.seul > 0)),
)
const pct = (k: number, r: Roles): string => {
  const n = r.lanceur + r.suiveur + r.seul
  return n && k ? `${Math.round((100 * k) / n)} %` : ''
}
</script>

<template>
  <section>
    <h2 class="mt-5 text-[13px] font-semibold lg:text-[15px]">Répartition des annonces</h2>
    <p class="mb-2 text-xs text-sage">
      Chaque prise de parole, pas seulement l'annonce finale. En % de ses annonces chiffrées ; la passe à
      part.
    </p>
    <CourbesDistribution
      :series="series"
      :categories="PALIERS.map((c) => LIBELLE_ANNONCE[c])"
      vide="Aucune annonce pour l'instant."
    />
    <button
      v-if="series.length"
      type="button"
      class="mt-2 cursor-pointer text-xs text-sage underline underline-offset-4 hover:text-mist"
      @click="detail = !detail"
    >
      {{ detail ? 'Masquer le détail' : 'Voir le détail ▼' }}
    </button>
    <div v-if="detail" class="mt-2 overflow-x-auto">
      <table class="w-full border-collapse text-[11px] tabular-nums lg:text-xs">
        <thead>
          <tr class="text-sage">
            <th class="pr-2 pb-1 text-left font-semibold">Joueur</th>
            <th v-for="c in CATEGORIES_ANNONCE" :key="c" class="px-1 pb-1 text-right font-semibold">
              {{ LIBELLE_ANNONCE[c] }}
            </th>
            <th class="pl-2 pb-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in joueurs.filter((j) => annonces.get(j))" :key="p" class="border-t border-white/8">
            <td class="py-1 pr-2 font-semibold whitespace-nowrap" :style="{ color: couleurs[p] }">
              {{ nomDe(p) }}
            </td>
            <td v-for="c in CATEGORIES_ANNONCE" :key="c" class="px-1 py-1 text-right text-mist">
              {{ annonces.get(p)![c] ?? '' }}
            </td>
            <td class="py-1 pl-2 text-right font-semibold">{{ total(annonces.get(p)!) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2 class="mt-6 text-[13px] font-semibold lg:text-[15px]">Lanceur, suiveur ou seul</h2>
    <p class="mb-2 text-xs text-sage">
      Quand son équipe a le contrat : a-t-il ouvert la couleur, monté sur son partenaire, ou pris seul ?
    </p>
    <p v-if="!lignesRoles.length" class="py-3 text-center text-sm text-sage">Aucun contrat pour l'instant.</p>
    <table v-else class="w-full border-collapse text-[13px] tabular-nums">
      <thead>
        <tr class="text-xs text-sage">
          <th class="pb-1 text-left font-semibold">Joueur</th>
          <th class="pb-1 text-right font-semibold">Lanceur</th>
          <th class="pb-1 text-right font-semibold">Suiveur</th>
          <th class="pb-1 text-right font-semibold">Seul</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="{ p, r } in lignesRoles" :key="p" class="border-t border-white/8">
          <td class="py-1.5 font-semibold" :style="{ color: couleurs[p] }">{{ nomDe(p) }}</td>
          <td class="py-1.5 text-right">
            {{ r.lanceur }} <span class="text-[11px] text-dusk">{{ pct(r.lanceur, r) }}</span>
          </td>
          <td class="py-1.5 text-right">
            {{ r.suiveur }} <span class="text-[11px] text-dusk">{{ pct(r.suiveur, r) }}</span>
          </td>
          <td class="py-1.5 text-right">
            {{ r.seul }} <span class="text-[11px] text-dusk">{{ pct(r.seul, r) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
