<script setup lang="ts">
/**
 * La pastille ivoire qui porte une couleur d'atout — ou SA / TA. Une seule pastille pour
 * toute l'app : chaque écran avait la sienne, avec un caractère de police jamais centré.
 *
 * Le symbole occupe un peu plus des deux tiers du rond, avec des marges égales au pixel
 * près. Centré par son cadre, le cœur paraissait trop haut : sa masse est en haut (centre
 * de masse 10,8 % au-dessus du centre de son cadre, mesuré le 21/10/2026). On le descend
 * de la moitié de cet écart, le réglage optique d'usage ; les trois autres sont équilibrés.
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
/** Le symbole : 68 % du rond, arrondi pour laisser la même marge de chaque côté. */
const iconSize = computed(() => {
  const margin = Math.round((props.size * (1 - 0.68)) / 2)
  return props.size - 2 * margin
})
/** Le décalage optique, vers le bas, en part de la taille du symbole. */
const OPTICAL_DROP: Record<Suit, number> = { h: 0.054, s: 0, d: 0, c: 0 }
/**
 * Le carreau est étroit (51 % du rond en largeur, contre 60 à 69 % pour les autres) : à
 * hauteur égale, il paraissait plus petit. Il grandit d'un cran.
 */
const OPTICAL_SCALE: Record<Suit, number> = { h: 1, s: 1, d: 1.12, c: 1 }
const transform = computed(() => {
  if (!color.value) return undefined
  const parts = [
    drop.value ? `translateY(${drop.value}px)` : '',
    OPTICAL_SCALE[color.value] !== 1 ? `scale(${OPTICAL_SCALE[color.value]})` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
})
const drop = computed(() =>
  color.value ? Math.round(iconSize.value * OPTICAL_DROP[color.value] * 10) / 10 : 0,
)
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
      :style="{
        width: `${iconSize}px`,
        height: `${iconSize}px`,
        transform,
      }"
    />
  </span>
</template>
