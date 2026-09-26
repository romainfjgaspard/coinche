<script setup lang="ts">
/**
 * Une carte citée dans un texte (« 8♠ », « V♥ ») : une petite étiquette ivoire, le rang
 * et le symbole en rouge ou en noir, comme le rappel du contrat. Sans fond, le noir ne
 * se lisait pas sur le tapis, et tout finissait en blanc.
 */
import { computed } from 'vue'
import type { Card } from '../game/cards'
import { SUIT_GLYPH } from '../game/display'

const props = defineProps<{ card: Card }>()
const NAMES: Record<string, string> = { J: 'V', Q: 'D', K: 'R', A: 'A' }
const suit = computed(() => props.card.slice(-1) as 's' | 'h' | 'd' | 'c')
const text = computed(() => {
  const rank = props.card.slice(0, -1)
  return `${NAMES[rank] ?? rank}${SUIT_GLYPH[suit.value]}`
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-[4px] bg-ivory px-1 py-px align-baseline text-[0.92em] leading-tight font-bold whitespace-nowrap"
    :class="suit === 'h' || suit === 'd' ? 'text-red-card' : 'text-felt-dark'"
    >{{ text }}</span
  >
</template>
