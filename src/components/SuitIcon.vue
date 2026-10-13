<script setup lang="ts">
/** Un symbole de couleur, dessiné comme sur les figures. Il prend la couleur du texte. */
import { computed } from 'vue'
import type { Suit } from '../game/cards'
import { SUIT_PATH } from '../game/suitPaths'

const props = defineProps<{ suit: Suit }>()
const path = computed(() => SUIT_PATH[props.suit])
</script>

<template>
  <svg
    :viewBox="path.viewBox"
    preserveAspectRatio="xMidYMid meet"
    fill="currentColor"
    aria-hidden="true"
    class="block"
  >
    <path :d="path.d" />
  </svg>
</template>
