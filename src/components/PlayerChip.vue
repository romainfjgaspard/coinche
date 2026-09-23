<script setup lang="ts">
/** Pastille d'un joueur : nom, donneur, tour de jeu, étoiles de la honte. */
import { PLAYER_NAMES, type PlayerId } from '../game/players'

defineProps<{
  player: PlayerId
  dealer?: boolean
  active?: boolean
  stars?: number
  me?: boolean
}>()
</script>

<template>
  <div
    class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
    :class="active ? 'border-gold bg-gold/20' : 'border-transparent bg-black/30'"
  >
    <span
      v-if="dealer"
      class="flex size-4 shrink-0 items-center justify-center rounded-full bg-ivory text-[10px] font-bold text-felt"
      title="Donneur"
    >D</span>
    <span class="text-xs font-semibold" :class="active ? 'text-gold' : 'text-mist'">
      {{ PLAYER_NAMES[player] }}<span v-if="me" class="text-sage"> · toi</span>
    </span>
    <span v-if="stars" class="text-xs leading-none text-gold" title="Étoiles de la honte">
      ★<span v-if="stars > 1">{{ stars }}</span>
    </span>
  </div>
</template>
