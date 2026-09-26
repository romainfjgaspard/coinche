<script setup lang="ts">
/**
 * Les parties : les soirées (parties enchaînées avec « Rejouer »), et celles qui ne
 * sont pas allées au bout — annulées, abandonnées, ou encore en cours.
 */
import { computed, ref } from 'vue'
import type { Archive } from '../game/archive'
import { evenings } from '../game/statsGlobal'
import type { UnfinishedGame } from '../firebase/game'
import { nameOf } from '../stores/roster'

const props = defineProps<{ archives: Archive[]; unfinished: UnfinishedGame[] | null }>()

const list = computed(() => evenings(props.archives))
const openKey = ref<string | null>(null)

const dayOf = (ms: number): string =>
  new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const hourOf = (ms: number): string =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const duo = (a: string, b: string): string => `${nameOf(a)} & ${nameOf(b)}`

/** Sans nouvelles depuis six heures, une partie non annulée est tenue pour abandonnée. */
const ABANDON_MS = 6 * 3600 * 1000
const statusOf = (p: UnfinishedGame): string =>
  p.cancelled
    ? 'annulée'
    : p.createdAt !== null && Date.now() - p.createdAt < ABANDON_MS
      ? 'en cours'
      : 'abandonnée'
const teams = (p: UnfinishedGame): string =>
  p.seating
    ? `${duo(p.seating[0], p.seating[2])} contre ${duo(p.seating[1], p.seating[3])}`
    : p.players.map(nameOf).join(', ')
</script>

<template>
  <section>
    <h2 class="mt-5 text-[15px] font-semibold lg:text-[15px]">Les soirées</h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Les parties enchaînées avec « Rejouer » forment une soirée.
    </p>
    <p v-if="!list.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
      Aucune partie terminée pour l'instant.
    </p>
    <div v-for="s in list" :key="s.key" class="border-t border-white/8">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
        :aria-expanded="openKey === s.key"
        @click="openKey = openKey === s.key ? null : s.key"
      >
        <span class="w-24 shrink-0 text-[15px] lg:text-[13px] font-semibold">{{ dayOf(s.start) }}</span>
        <span class="shrink-0 text-[13px] lg:text-xs text-sage"
          >{{ s.games.length }} partie{{ s.games.length > 1 ? 's' : '' }}</span
        >
        <span class="grow truncate text-right text-[13px] lg:text-xs text-mist">
          {{
            s.victories
              .filter((v) => v.won > 0)
              .map((v) => `${duo(v.pair[0], v.pair[1])} ${v.won}`)
              .join(' · ')
          }}
        </span>
        <span
          class="text-[13px] lg:text-xs text-dusk transition"
          :class="openKey === s.key ? 'rotate-180' : ''"
          >▼</span
        >
      </button>
      <div v-if="openKey === s.key" class="pb-3">
        <div
          v-for="a in s.games"
          :key="a.code"
          class="flex items-center gap-3 py-1 pl-3 text-[14px] lg:text-[12px]"
        >
          <span class="w-12 shrink-0 text-sage">{{ hourOf(a.finishedAt) }}</span>
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
    <h2 class="mt-6 text-[15px] font-semibold lg:text-[15px]">
      Parties non finies<span v-if="unfinished" class="font-normal text-sage">
        · {{ unfinished.length }}</span
      >
    </h2>
    <p class="mb-2 text-[13px] lg:text-xs text-sage">
      Commencées mais pas allées au bout. Elles ne comptent dans aucune autre statistique.
    </p>
    <p v-if="unfinished === null" class="py-3 text-center text-[15px] lg:text-sm text-sage">Chargement…</p>
    <p v-else-if="!unfinished.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
      Aucune : toutes les parties sont allées au bout.
    </p>
    <div
      v-for="p in unfinished ?? []"
      :key="p.code"
      class="flex items-center gap-3 border-t border-white/8 py-2 text-[14px] lg:text-[12px]"
    >
      <span class="w-20 shrink-0 text-sage">{{ p.createdAt ? dayOf(p.createdAt) : '—' }}</span>
      <span class="min-w-0 grow">
        <span class="block truncate text-mist">{{ teams(p) }}</span>
        <span class="text-dusk"
          >{{ p.deals }} donne{{ p.deals > 1 ? 's' : '' }} · {{ p.scores[0] }} – {{ p.scores[1] }}</span
        >
      </span>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[13px] lg:text-[11px] font-semibold"
        :class="
          statusOf(p) === 'annulée'
            ? 'bg-red-card/25 text-[#f0a293]'
            : statusOf(p) === 'en cours'
              ? 'bg-gold/20 text-gold'
              : 'bg-white/10 text-mist'
        "
        >{{ statusOf(p) }}</span
      >
    </div>
  </section>
</template>
