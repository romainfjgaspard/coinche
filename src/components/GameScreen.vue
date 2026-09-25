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
import { nomDe } from '../stores/roster'

const session = useSession()
const phase = computed(() => session.game?.phase ?? 'lobby')
const vue = ref<'table' | 'stats' | 'regles'>('table')
const grand = useLargeScreen()
</script>

<template>
  <!-- Sur téléphone la table reste une colonne ; sur grand écran elle occupe tout. -->
  <div class="h-full">
    <div
      class="relative mx-auto h-full w-full"
      :class="vue === 'table' ? 'max-w-md lg:max-w-none' : 'max-w-none'"
    >
    <template v-if="vue === 'table'">
      <GameTablePc v-if="grand" @stats="vue = 'stats'" @regles="vue = 'regles'" />
      <GameTable v-else @stats="vue = 'stats'" @regles="vue = 'regles'" />
      <BiddingPanel v-if="phase === 'encheres'" />
      <!-- Le décompte attend que le dernier pli ait été vu sur le tapis -->
      <DealResult
        v-else-if="(phase === 'decompte' || phase === 'terminee' || phase === 'lobby') && !session.heldTrick"
        @stats="vue = 'stats'"
      />
      <!-- Un joueur ne répond plus depuis une minute : on peut le faire remplacer par un bot -->
      <div
        v-if="session.humainAbsent && !session.pause"
        class="absolute inset-x-3 top-16 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-white/15 bg-felt-dark/95 px-4 py-2.5 shadow-xl lg:inset-x-auto lg:top-20 lg:left-6 lg:mx-0"
      >
        <span class="grow text-[13px] text-mist lg:text-sm">
          <span class="font-semibold text-ivory">{{ nomDe(session.humainAbsent) }}</span> ne répond plus depuis une minute.
        </span>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40 lg:text-sm"
          :disabled="session.busy"
          @click="session.remplacerParBot(session.humainAbsent)"
        >Le remplacer par un bot</button>
      </div>
      <!-- Ma place, prise par un bot pendant mon absence -->
      <div
        v-if="session.placePrise"
        class="absolute inset-x-0 top-14 bottom-0 z-50 flex items-center justify-center bg-black/60 px-6 lg:top-16"
      >
        <div class="w-full max-w-xs rounded-2xl border border-white/10 bg-felt-dark px-6 py-5 text-center shadow-2xl lg:max-w-sm lg:py-7">
          <p class="font-display text-2xl lg:text-3xl">Un bot joue à ta place</p>
          <p class="mt-1.5 text-sm text-sage">Tu ne répondais plus : les autres l'ont appelé pour continuer.</p>
          <button
            type="button"
            class="mt-5 h-12 w-full cursor-pointer rounded-xl bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
            :disabled="session.busy"
            @click="session.reprendreMaPlace()"
          >Reprendre ma place</button>
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
        <div class="w-full max-w-xs rounded-2xl border border-white/10 bg-felt-dark px-6 py-5 text-center shadow-2xl lg:max-w-sm lg:py-7">
          <p class="font-display text-3xl lg:text-4xl">En pause</p>
          <p class="mt-1.5 text-sm text-sage lg:text-base">mise par {{ nomDe(session.pause.par) }}</p>
          <button
            type="button"
            class="mt-5 h-12 w-full cursor-pointer rounded-xl bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
            :disabled="session.busy"
            @click="session.basculerPause()"
          >Reprendre</button>
        </div>
      </div>
    </template>
    <RulesScreen v-else-if="vue === 'regles'" retour="Table" @fermer="vue = 'table'" />
    <StatsScreen v-else @fermer="vue = 'table'" />
    <p
      v-if="session.error"
      class="absolute inset-x-4 top-20 rounded-xl bg-red-card px-4 py-2.5 text-center text-sm text-ivory"
    >{{ session.error }}</p>
    </div>
  </div>
</template>
