<script setup lang="ts">
import type { Suit } from '../game/cards'
import SuitIcon from './SuitIcon.vue'

// Deux couleurs seulement, rouge et noir (décision du 23/09).
const suits: { suit: Suit; red: boolean }[] = [
  { suit: 's', red: false },
  { suit: 'h', red: true },
  { suit: 'd', red: true },
  { suit: 'c', red: false },
]
</script>

<template>
  <div class="flex gap-1.5" aria-hidden="true">
    <span
      v-for="s in suits"
      :key="s.suit"
      class="flex h-7 w-8 items-center justify-center rounded bg-ivory"
      :class="s.red ? 'text-red-card' : 'text-felt-dark'"
    >
      <SuitIcon :suit="s.suit" class="size-[18px]" />
    </span>
  </div>
</template>
