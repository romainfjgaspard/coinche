<script setup lang="ts">
/** Pastille d'un joueur : nom, donneur, tour de jeu, étoiles de la honte. */
import { type PlayerId } from '../game/players'
import { nameOf } from '../stores/roster'
import { SUIT_GLYPH } from '../game/display'
import type { LastBid } from '../composables/useTableState'
import DealerChip from './DealerChip.vue'

defineProps<{
  player: PlayerId
  dealer?: boolean
  active?: boolean
  stars?: number
  me?: boolean
  /** Pendant les enchères : sa dernière parole (« 90 ♥ », « Passe », « Coinche ») */
  bid?: LastBid
  /** Annonce en grand : sur PC, elle se lit de loin, comme le rappel du contrat */
  large?: boolean
  /** C'est à lui de parler : « réfléchit… » sous son nom, à la place de sa dernière annonce */
  thinking?: boolean
  /** Sa belote annoncée : « Belote » après la première tête, « Rebelote » après la seconde */
  belote?: 'belote' | 'rebelote' | null
}>()
</script>

<template>
  <div class="relative">
    <!-- Celui qui doit agir est en or plein : un simple liseré ne se voyait pas de loin -->
    <div
      class="flex items-center gap-1.5 rounded-full border px-3 py-1 whitespace-nowrap transition lg:px-2.5 lg:py-0.5"
      :class="
        active
          ? 'border-gold bg-gold shadow-[0_0_14px_2px_rgba(217,164,65,.55)]'
          : 'border-transparent bg-black/35'
      "
    >
      <DealerChip v-if="dealer" :size="16" />
      <!-- Le texte suit la transition du fond : sinon, le temps qu'elle dure, le nom foncé
         se posait sur un fond encore sombre et disparaissait -->
      <span
        class="text-[15px] font-semibold transition-colors lg:text-xs"
        :class="active ? 'text-felt' : 'text-mist'"
      >
        {{ nameOf(player) }}<span v-if="me" :class="active ? 'text-felt/70' : 'text-sage'"> · toi</span>
      </span>
      <span
        v-if="stars"
        class="text-sm leading-none lg:text-xs"
        :class="active ? 'text-felt' : 'text-gold'"
        title="Étoiles de la honte"
        >★<span v-if="stars > 1">{{ stars }}</span></span
      >
      <span
        v-if="belote"
        class="rounded-full px-1.5 py-px text-[10px] leading-tight font-bold tracking-wide uppercase"
        :class="active ? 'bg-felt text-gold' : 'bg-gold text-felt'"
        >{{ belote === 'rebelote' ? 'Rebelote' : 'Belote' }}</span
      >
    </div>
    <!--
    La dernière annonce, sous le nom et hors du flux : dans la pastille, elle
    l'élargissait et la faisait déborder de l'écran sur les côtés.
  -->
    <span
      v-if="thinking"
      class="absolute top-full left-1/2 -translate-x-1/2 rounded-full bg-black/45 whitespace-nowrap text-mist italic"
      :class="large ? 'mt-1.5 px-2.5 py-0.5 text-base' : 'mt-1 px-2 py-px text-sm lg:text-xs'"
      >réfléchit…</span
    >
    <span
      v-else-if="bid"
      class="absolute top-full left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap"
      :class="[
        large
          ? 'mt-2 gap-[7.4px] font-display text-[26.7px] leading-none'
          : 'mt-1 gap-1 rounded-full bg-black/45 py-px pr-0.5 pl-2 text-sm font-bold lg:text-xs',
        bid.coinche ? 'pr-2.5 text-[#f0a293]' : bid.pass ? 'pr-2.5 text-sage' : 'text-gold',
      ]"
    >
      {{ bid.text }}
      <!--
      Le symbole sur fond ivoire, en rouge ou en noir. Sur PC, exactement le rappel du
      contrat : 36 et 24 px à l'échelle de la table, divisés par le 1,35 de la pastille.
    -->
      <span
        v-if="bid.suit"
        class="flex items-center justify-center rounded-full bg-ivory leading-none font-bold"
        :class="[
          large
            ? 'h-[26.7px] min-w-[26.7px] px-[4.4px] font-sans text-[17.8px]'
            : 'h-[18px] min-w-[18px] px-0.5 text-xs lg:h-4 lg:min-w-4 lg:text-[11px]',
          bid.suit === 'h' || bid.suit === 'd' ? 'text-red-card' : 'text-felt-dark',
        ]"
        >{{ bid.suit === 'sa' || bid.suit === 'ta' ? bid.suit.toUpperCase() : SUIT_GLYPH[bid.suit] }}</span
      >
    </span>
  </div>
</template>
