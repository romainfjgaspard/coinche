<script setup lang="ts">
/**
 * La pastille ivoire qui porte une couleur d'atout — ou SA / TA. Une seule pastille pour
 * toute l'app : chaque écran avait la sienne, avec un caractère de police jamais centré.
 * Le symbole occupe les deux tiers du rond, centré au pixel près.
 */
import { computed } from 'vue'
import type { Declaration } from '../game/bidding'
import type { Suit } from '../game/cards'
import { isRed } from '../game/display'
import SuitIcon from './SuitIcon.vue'

const props = withDefaults(defineProps<{ suit: Declaration; size?: number }>(), { size: 24 })

const text = computed(() => props.suit === 'sa' || props.suit === 'ta')
/** La couleur, quand c'en est une : SA et TA s'écrivent en lettres. */
const color = computed<Suit | null>(() => (text.value ? null : (props.suit as Suit)))
const label = computed(() =>
  props.suit === 'sa'
    ? 'sans-atout'
    : props.suit === 'ta'
      ? 'tout-atout'
      : { s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' }[props.suit],
)
</script>

<template>
  <span
    role="img"
    :aria-label="label"
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-ivory leading-none font-bold"
    :class="color && isRed(color) ? 'text-red-card' : 'text-felt-dark'"
    :style="{
      width: text ? undefined : `${size}px`,
      minWidth: `${size}px`,
      height: `${size}px`,
      padding: text ? `0 ${Math.round(size * 0.2)}px` : undefined,
      fontSize: `${Math.round(size * 0.5)}px`,
    }"
  >
    <template v-if="!color">{{ suit.toUpperCase() }}</template>
    <SuitIcon
      v-else
      :suit="color"
      :style="{ width: `${Math.round(size * 0.64)}px`, height: `${Math.round(size * 0.64)}px` }"
    />
  </span>
</template>
