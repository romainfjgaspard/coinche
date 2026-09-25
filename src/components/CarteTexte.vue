<script setup lang="ts">
/**
 * Une carte citée dans un texte (« 8♠ », « V♥ ») : une petite étiquette ivoire, le rang
 * et le symbole en rouge ou en noir, comme le rappel du contrat. Sans fond, le noir ne
 * se lisait pas sur le tapis, et tout finissait en blanc.
 */
import { computed } from 'vue'
import type { Card } from '../game/cards'
import { SUIT_GLYPH } from '../game/display'

const props = defineProps<{ carte: Card }>()
const NOMS: Record<string, string> = { J: 'V', Q: 'D', K: 'R', A: 'A' }
const couleur = computed(() => props.carte.slice(-1) as 's' | 'h' | 'd' | 'c')
const texte = computed(() => {
  const rang = props.carte.slice(0, -1)
  return `${NOMS[rang] ?? rang}${SUIT_GLYPH[couleur.value]}`
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-[4px] bg-ivory px-1 py-px align-baseline text-[0.92em] leading-tight font-bold whitespace-nowrap"
    :class="couleur === 'h' || couleur === 'd' ? 'text-red-card' : 'text-felt-dark'"
    >{{ texte }}</span
  >
</template>
