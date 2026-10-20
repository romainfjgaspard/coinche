<script setup lang="ts">
/** La table, avec le panneau d'enchères ou le décompte par-dessus selon la phase. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import GameTable from './GameTable.vue'
import GameTablePc from './GameTablePc.vue'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useWakeLock } from '../composables/useWakeLock'
import BiddingPanel from './BiddingPanel.vue'
import BiddingPanelPhone from './BiddingPanelPhone.vue'
import UndoBid from './UndoBid.vue'
import DealResult from './DealResult.vue'
import StatsScreen from './StatsScreen.vue'
import RulesScreen from './RulesScreen.vue'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'

const session = useSession()
const phase = computed(() => session.game?.phase ?? 'lobby')
const view = ref<'table' | 'stats' | 'rules'>('table')
const large = useLargeScreen()

/** L'écran reste allumé tant que la partie se joue ; une partie finie le laisse s'éteindre. */
useWakeLock(computed(() => phase.value !== 'finished' && phase.value !== 'cancelled'))

/**
 * C'est à moi d'agir. Hors de la table (stats, règles) ou l'onglet en arrière-plan, on
 * ne le voyait pas : la table attendait sans que personne sache pourquoi.
 */
const myTurn = computed<'bid' | 'play' | null>(() =>
  session.pause ? null : session.myBidTurn ? 'bid' : session.myPlayTurn ? 'play' : null,
)
const TITLE = document.title
watch(myTurn, (turn, before) => {
  const away = view.value !== 'table' || document.hidden
  if (turn && !before && away) {
    // Une courte vibration sur téléphone, là où le navigateur l'autorise.
    try {
      navigator.vibrate?.(180)
    } catch {
      /* sans vibration, le bandeau suffit */
    }
  }
  document.title = turn && document.hidden ? `● À toi — ${TITLE}` : TITLE
})
const onVisible = () => {
  if (!document.hidden) document.title = TITLE
}
document.addEventListener('visibilitychange', onVisible)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  document.title = TITLE
})
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
        <template v-if="phase === 'bidding'">
          <BiddingPanel v-if="large" />
          <BiddingPanelPhone v-else />
          <UndoBid />
        </template>
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
        <!-- Ma place, reprise depuis un autre appareil -->
        <div
          v-if="session.movedAway"
          class="absolute inset-x-0 top-14 bottom-0 z-50 flex items-center justify-center bg-black/60 px-6 lg:top-16"
        >
          <div
            class="w-full max-w-xs rounded-2xl border border-white/10 bg-felt-dark px-6 py-5 text-center shadow-2xl lg:max-w-sm lg:py-7"
          >
            <p class="font-display text-2xl lg:text-3xl">Partie reprise ailleurs</p>
            <p class="mt-1.5 text-sm text-sage">Ta place joue maintenant depuis un autre appareil.</p>
            <button
              type="button"
              class="mt-5 h-12 w-full cursor-pointer rounded-xl border border-white/20 text-[15px] font-semibold text-mist"
              @click="session.leave()"
            >
              Revenir à l'accueil
            </button>
          </div>
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
      <!-- À moi d'agir pendant que je lis les stats ou les règles -->
      <div
        v-if="view !== 'table' && myTurn"
        role="alert"
        class="fixed inset-x-3 bottom-4 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-gold py-2.5 pr-2.5 pl-4 text-felt shadow-[0_10px_30px_rgba(0,0,0,.55)]"
      >
        <span class="relative flex size-3 shrink-0">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-felt/50"></span>
          <span class="relative inline-flex size-3 rounded-full bg-felt"></span>
        </span>
        <span class="grow text-[15px] font-bold">
          {{ myTurn === 'bid' ? "C'est à toi de parler" : "C'est à toi de jouer" }}
        </span>
        <button
          type="button"
          class="h-10 shrink-0 cursor-pointer rounded-xl bg-felt px-3.5 text-sm font-bold text-ivory transition hover:brightness-125"
          @click="view = 'table'"
        >
          Retour à la table
        </button>
      </div>
      <p
        v-if="session.error"
        class="absolute inset-x-4 top-20 rounded-xl bg-red-card px-4 py-2.5 text-center text-sm text-ivory"
      >
        {{ session.error }}
      </p>
    </div>
  </div>
</template>
