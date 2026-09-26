<script setup lang="ts">
/** La table, avec le panneau d'enchères ou le décompte par-dessus selon la phase. */
import { computed, ref } from 'vue'
import GameTable from './GameTable.vue'
import GameTablePc from './GameTablePc.vue'
import { useLargeScreen } from '../composables/useLargeScreen'
import BiddingPanel from './BiddingPanel.vue'
import DealResult from './DealResult.vue'
import StatsScreen from './StatsScreen.vue'
import RulesScreen from './RulesScreen.vue'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'

const session = useSession()
const phase = computed(() => session.game?.phase ?? 'lobby')
const view = ref<'table' | 'stats' | 'rules'>('table')
const large = useLargeScreen()
</script>

<template>
  <!-- Sur téléphone la table reste une colonne ; sur grand écran elle occupe tout. -->
  <div class="h-full">
    <div
      class="relative mx-auto h-full w-full"
      :class="view === 'table' ? 'max-w-md lg:max-w-none' : 'max-w-none'"
    >
      <template v-if="view === 'table'">
        <GameTablePc v-if="large" @stats="view = 'stats'" @rules="view = 'rules'" />
        <GameTable v-else @stats="view = 'stats'" @rules="view = 'rules'" />
        <BiddingPanel v-if="phase === 'bidding'" />
        <!-- Le décompte attend que le dernier pli ait été vu sur le tapis -->
        <DealResult
          v-else-if="(phase === 'scoring' || phase === 'finished' || phase === 'lobby') && !session.heldTrick"
          @stats="view = 'stats'"
        />
        <!-- Un joueur ne répond plus depuis une minute : on peut le faire remplacer par un bot -->
        <div
          v-if="session.absentHuman && !session.pause"
          class="absolute inset-x-3 top-16 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-white/15 bg-felt-dark/95 px-4 py-2.5 shadow-xl lg:inset-x-auto lg:top-20 lg:left-6 lg:mx-0"
        >
          <span class="grow text-[13px] text-mist lg:text-sm">
            <span class="font-semibold text-ivory">{{ nameOf(session.absentHuman) }}</span> ne répond plus
            depuis une minute.
          </span>
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40 lg:text-sm"
            :disabled="session.busy"
            @click="session.replaceWithBot(session.absentHuman)"
          >
            Le remplacer par un bot
          </button>
        </div>
        <!-- Ma place, prise par un bot pendant mon absence -->
        <div
          v-if="session.seatTaken"
          class="absolute inset-x-0 top-14 bottom-0 z-50 flex items-center justify-center bg-black/60 px-6 lg:top-16"
        >
          <div
            class="w-full max-w-xs rounded-2xl border border-white/10 bg-felt-dark px-6 py-5 text-center shadow-2xl lg:max-w-sm lg:py-7"
          >
            <p class="font-display text-2xl lg:text-3xl">Un bot joue à ta place</p>
            <p class="mt-1.5 text-sm text-sage">
              Tu ne répondais plus : les autres l'ont appelé pour continuer.
            </p>
            <button
              type="button"
              class="mt-5 h-12 w-full cursor-pointer rounded-xl bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
              :disabled="session.busy"
              @click="session.reclaimSeat()"
            >
              Reprendre ma place
            </button>
          </div>
        </div>
        <!--
        La pause, par-dessus la table et le panneau d'enchères : plus personne ne peut
        jouer. L'en-tête reste accessible, pour quitter ou lire les règles.
      -->
        <div
          v-if="session.pause"
          class="absolute inset-x-0 top-14 bottom-0 z-50 flex items-center justify-center bg-black/60 px-6 lg:top-16"
        >
          <div
            class="w-full max-w-xs rounded-2xl border border-white/10 bg-felt-dark px-6 py-5 text-center shadow-2xl lg:max-w-sm lg:py-7"
          >
            <p class="font-display text-3xl lg:text-4xl">En pause</p>
            <p class="mt-1.5 text-sm text-sage lg:text-base">mise par {{ nameOf(session.pause.by) }}</p>
            <button
              type="button"
              class="mt-5 h-12 w-full cursor-pointer rounded-xl bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
              :disabled="session.busy"
              @click="session.togglePause()"
            >
              Reprendre
            </button>
          </div>
        </div>
      </template>
      <RulesScreen v-else-if="view === 'rules'" back-label="Table" @close="view = 'table'" />
      <StatsScreen v-else @close="view = 'table'" />
      <p
        v-if="session.error"
        class="absolute inset-x-4 top-20 rounded-xl bg-red-card px-4 py-2.5 text-center text-sm text-ivory"
      >
        {{ session.error }}
      </p>
    </div>
  </div>
</template>
