<script setup lang="ts">
/**
 * Les parties : les soirées (parties enchaînées avec « Rejouer »), et celles qui ne
 * sont pas allées au bout — annulées, abandonnées, ou encore en cours.
 */
import { computed, ref } from 'vue'
import type { Archive } from '../game/archive'
import { soirees } from '../game/statsGlobal'
import type { PartieNonFinie } from '../firebase/partie'
import { nomDe } from '../stores/roster'

const props = defineProps<{ archives: Archive[]; nonFinies: PartieNonFinie[] | null }>()

const liste = computed(() => soirees(props.archives))
const ouverte = ref<string | null>(null)

const jour = (ms: number): string =>
  new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const heure = (ms: number): string =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const duo = (a: string, b: string): string => `${nomDe(a)} & ${nomDe(b)}`

/** Sans nouvelles depuis six heures, une partie non annulée est tenue pour abandonnée. */
const ABANDON_MS = 6 * 3600 * 1000
const statut = (p: PartieNonFinie): string =>
  p.annulee ? 'annulée' : p.creeLe !== null && Date.now() - p.creeLe < ABANDON_MS ? 'en cours' : 'abandonnée'
const equipes = (p: PartieNonFinie): string =>
  p.seating
    ? `${duo(p.seating[0], p.seating[2])} contre ${duo(p.seating[1], p.seating[3])}`
    : p.joueurs.map(nomDe).join(', ')
</script>

<template>
  <section>
    <h2 class="mt-5 text-[13px] font-semibold lg:text-[15px]">Les soirées</h2>
    <p class="mb-2 text-xs text-sage">Les parties enchaînées avec « Rejouer » forment une soirée.</p>
    <p v-if="!liste.length" class="py-3 text-center text-sm text-sage">
      Aucune partie terminée pour l'instant.
    </p>
    <div v-for="s in liste" :key="s.cle" class="border-t border-white/8">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
        :aria-expanded="ouverte === s.cle"
        @click="ouverte = ouverte === s.cle ? null : s.cle"
      >
        <span class="w-24 shrink-0 text-[13px] font-semibold">{{ jour(s.debut) }}</span>
        <span class="shrink-0 text-xs text-sage"
          >{{ s.parties.length }} partie{{ s.parties.length > 1 ? 's' : '' }}</span
        >
        <span class="grow truncate text-right text-xs text-mist">
          {{
            s.victoires
              .filter((v) => v.gagnees > 0)
              .map((v) => `${duo(v.paire[0], v.paire[1])} ${v.gagnees}`)
              .join(' · ')
          }}
        </span>
        <span class="text-xs text-dusk transition" :class="ouverte === s.cle ? 'rotate-180' : ''">▼</span>
      </button>
      <div v-if="ouverte === s.cle" class="pb-3">
        <div v-for="a in s.parties" :key="a.code" class="flex items-center gap-3 py-1 pl-3 text-[12px]">
          <span class="w-12 shrink-0 text-sage">{{ heure(a.finishedAt) }}</span>
          <span class="grow truncate">
            <span :class="a.winner === 0 ? 'font-semibold text-ivory' : 'text-mist'">{{
              duo(a.seating[0], a.seating[2])
            }}</span>
            <span class="text-dusk"> contre </span>
            <span :class="a.winner === 1 ? 'font-semibold text-ivory' : 'text-mist'">{{
              duo(a.seating[1], a.seating[3])
            }}</span>
          </span>
          <span class="shrink-0 tabular-nums text-mist">{{ a.scores[0] }} – {{ a.scores[1] }}</span>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2 class="mt-6 text-[13px] font-semibold lg:text-[15px]">
      Parties non finies<span v-if="nonFinies" class="font-normal text-sage"> · {{ nonFinies.length }}</span>
    </h2>
    <p class="mb-2 text-xs text-sage">
      Commencées mais pas allées au bout. Elles ne comptent dans aucune autre statistique.
    </p>
    <p v-if="nonFinies === null" class="py-3 text-center text-sm text-sage">Chargement…</p>
    <p v-else-if="!nonFinies.length" class="py-3 text-center text-sm text-sage">
      Aucune : toutes les parties sont allées au bout.
    </p>
    <div
      v-for="p in nonFinies ?? []"
      :key="p.code"
      class="flex items-center gap-3 border-t border-white/8 py-2 text-[12px]"
    >
      <span class="w-20 shrink-0 text-sage">{{ p.creeLe ? jour(p.creeLe) : '—' }}</span>
      <span class="grow">
        <span class="block truncate text-mist">{{ equipes(p) }}</span>
        <span class="text-dusk"
          >{{ p.donnes }} donne{{ p.donnes > 1 ? 's' : '' }} · {{ p.scores[0] }} – {{ p.scores[1] }}</span
        >
      </span>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        :class="
          statut(p) === 'annulée'
            ? 'bg-red-card/25 text-[#f0a293]'
            : statut(p) === 'en cours'
              ? 'bg-gold/20 text-gold'
              : 'bg-white/10 text-mist'
        "
        >{{ statut(p) }}</span
      >
    </div>
  </section>
</template>
