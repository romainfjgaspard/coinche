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
  <!-- Celui qui doit agir est en or plein : un simple liseré ne se voyait pas de loin -->
  <div
    class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 whitespace-nowrap transition"
    :class="active
      ? 'border-gold bg-gold shadow-[0_0_14px_2px_rgba(217,164,65,.55)]'
      : 'border-transparent bg-black/35'"
  >
    <span
      v-if="dealer"
      class="flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      :class="active ? 'bg-felt text-gold' : 'bg-ivory text-felt'"
      title="Donneur"
    >D</span>
    <span class="text-xs font-semibold" :class="active ? 'text-felt' : 'text-mist'">
      {{ PLAYER_NAMES[player] }}<span v-if="me" :class="active ? 'text-felt/70' : 'text-sage'"> · toi</span>
    </span>
    <span
      v-if="stars"
      class="text-xs leading-none"
      :class="active ? 'text-felt' : 'text-gold'"
      title="Étoiles de la honte"
    >★<span v-if="stars > 1">{{ stars }}</span></span>
  </div>
</template>
