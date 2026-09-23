<script setup lang="ts">
/**
 * Une carte à jouer, à la française : index aux quatre coins, pointes disposées
 * selon le rang, illustration pour les figures.
 * Toutes les dimensions dérivent de `width`, pour servir aussi bien la main
 * que le pli ou les vignettes du dernier pli.
 */
import { computed } from 'vue'
import { type Card, rankOf, suitOf } from '../game/cards'
import { RANK_LABEL, SUIT_GLYPH, cardLabel, courtImage, isRed, pipLayout } from '../game/display'

const props = withDefaults(
  defineProps<{
    card: Card
    width?: number
    /** Carte non jouable pour l'instant */
    dimmed?: boolean
    /** Atout, mis en évidence */
    trump?: boolean
    /** Carte gagnante d'un pli */
    winner?: boolean
    clickable?: boolean
  }>(),
  { width: 54, dimmed: false, trump: false, winner: false, clickable: false },
)

const emit = defineEmits<{ select: [card: Card] }>()

const rank = computed(() => rankOf(props.card))
const suit = computed(() => suitOf(props.card))
const ink = computed(() => (isRed(suit.value) ? '#c0392b' : '#1f2937'))
const image = computed(() => courtImage(props.card))
const pips = computed(() => pipLayout(rank.value))

const s = computed(() => {
  const w = props.width
  return {
    width: `${w}px`,
    height: `${Math.round(w * 1.44)}px`,
    radius: `${Math.max(3, Math.round(w * 0.13))}px`,
    pad: `${Math.max(2, Math.round(w * 0.045))}px`,
    rankSize: `${Math.round(w * 0.21)}px`,
    pipSize: `${Math.round(w * 0.14)}px`,
    inset: `${Math.round(w * 0.3)}px`,
    bigPip: `${Math.round(w * 0.36)}px`,
    smallPip: `${Math.round(w * 0.16)}px`,
  }
})
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    :aria-label="clickable ? `Jouer le ${cardLabel(card)}` : cardLabel(card)"
    class="relative shrink-0 border bg-[#fdfcf8] p-0 shadow-[0_5px_12px_rgba(0,0,0,.45),inset_0_0_0_1px_rgba(255,255,255,.7)] transition"
    :class="[
      dimmed ? 'opacity-40' : 'opacity-100',
      clickable ? 'cursor-pointer hover:-translate-y-1' : '',
      winner ? 'border-gold' : 'border-black/20',
    ]"
    :style="{ width: s.width, height: s.height, borderRadius: s.radius }"
    @click="clickable && emit('select', card)"
  >
    <img
      v-if="image"
      :src="image"
      alt=""
      class="absolute inset-0 size-full"
      :style="{ borderRadius: s.radius }"
    />

    <!-- Index aux quatre coins : droits en haut, retournés en bas -->
    <span
      v-for="corner in [
        { v: 'top', h: 'left', flip: false },
        { v: 'top', h: 'right', flip: false },
        { v: 'bottom', h: 'left', flip: true },
        { v: 'bottom', h: 'right', flip: true },
      ]"
      :key="`${corner.v}${corner.h}`"
      class="absolute rounded-[3px] bg-[#fdfcf8] px-[2px] py-px text-center leading-none"
      :style="{
        [corner.v]: s.pad,
        [corner.h]: s.pad,
        transform: corner.flip ? 'rotate(180deg)' : undefined,
      }"
    >
      <span class="block font-bold" :style="{ fontSize: s.rankSize, color: ink }">
        {{ RANK_LABEL[rank] }}
      </span>
      <span class="block" :style="{ fontSize: s.pipSize, color: ink }">{{ SUIT_GLYPH[suit] }}</span>
    </span>

    <!-- Pointes, pour les rangs sans illustration -->
    <span
      v-if="pips.length"
      class="absolute"
      :style="{ left: s.inset, right: s.inset, top: '13%', bottom: '13%' }"
    >
      <span
        v-for="(pip, i) in pips"
        :key="i"
        class="absolute leading-none"
        :style="{
          left: `${pip.x}%`,
          top: `${pip.y}%`,
          fontSize: pip.large ? s.bigPip : s.smallPip,
          color: ink,
          transform: `translate(-50%, -50%) rotate(${pip.flipped ? 180 : 0}deg)`,
        }"
      >{{ SUIT_GLYPH[suit] }}</span>
    </span>

    <!-- Atout mis en évidence -->
    <span
      v-if="trump"
      class="pointer-events-none absolute -inset-0.5 border-2 border-gold"
      :style="{ borderRadius: `calc(${s.radius} + 2px)` }"
    ></span>
  </component>
</template>
