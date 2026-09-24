<script setup lang="ts">
/** Pastille d'un joueur : nom, donneur, tour de jeu, étoiles de la honte. */
import { type PlayerId } from '../game/players'
import { nomDe } from '../stores/roster'
import DealerChip from './DealerChip.vue'

defineProps<{
  player: PlayerId
  dealer?: boolean
  active?: boolean
  stars?: number
  me?: boolean
  /** Pendant les enchères : sa dernière parole (« 90 ♥ », « Passe », « Coinche ») */
  annonce?: { texte: string; passe: boolean; coinche: boolean }
}>()
</script>

<template>
  <div class="relative">
  <!-- Celui qui doit agir est en or plein : un simple liseré ne se voyait pas de loin -->
  <div
    class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 whitespace-nowrap transition"
    :class="active
      ? 'border-gold bg-gold shadow-[0_0_14px_2px_rgba(217,164,65,.55)]'
      : 'border-transparent bg-black/35'"
  >
    <DealerChip v-if="dealer" :size="16" />
    <!-- Le texte suit la transition du fond : sinon, le temps qu'elle dure, le nom foncé
         se posait sur un fond encore sombre et disparaissait -->
    <span class="text-xs font-semibold transition-colors" :class="active ? 'text-felt' : 'text-mist'">
      {{ nomDe(player) }}<span v-if="me" :class="active ? 'text-felt/70' : 'text-sage'"> · toi</span>
    </span>
    <span
      v-if="stars"
      class="text-xs leading-none"
      :class="active ? 'text-felt' : 'text-gold'"
      title="Étoiles de la honte"
    >★<span v-if="stars > 1">{{ stars }}</span></span>
  </div>
  <!--
    La dernière annonce, sous le nom et hors du flux : dans la pastille, elle
    l'élargissait et la faisait déborder de l'écran sur les côtés.
  -->
  <span
    v-if="annonce"
    class="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-black/45 px-2 py-px text-xs whitespace-nowrap"
    :class="annonce.coinche ? 'font-bold text-[#f0a293]' : annonce.passe ? 'font-medium text-sage' : 'font-bold text-gold'"
  >{{ annonce.texte }}</span>
  </div>
</template>
