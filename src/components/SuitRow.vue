<script setup lang="ts">
// Deux couleurs seulement, rouge et noir (décision du 23/09).
const suits: { glyph: string; red: boolean }[] = [
  { glyph: '♠', red: false },
  { glyph: '♥', red: true },
  { glyph: '♦', red: true },
  { glyph: '♣', red: false },
]
</script>

<template>
  <div class="flex gap-1.5" aria-hidden="true">
    <span
      v-for="s in suits"
      :key="s.glyph"
      class="flex items-center justify-center rounded bg-ivory px-1.5 py-0.5 text-xl leading-none"
      :class="s.red ? 'text-red-card' : 'text-felt-dark'"
    >{{ s.glyph }}</span>
  </div>
</template>
