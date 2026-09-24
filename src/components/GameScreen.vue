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
