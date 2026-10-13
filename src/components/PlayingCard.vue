<script setup lang="ts">
/**
 * Une carte à jouer, à la française : index aux quatre coins, pointes disposées
 * selon le rang, illustration pour les figures.
 * Toutes les dimensions dérivent de `width`, pour servir aussi bien la main
 * que le pli ou les vignettes du dernier pli.
 */
import { computed } from 'vue'
import { type Card, rankOf, suitOf } from '../game/cards'
import { RANK_LABEL, cardLabel, courtCrop, courtImage, isRed, pipLayout } from '../game/display'
import SuitIcon from './SuitIcon.vue'

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
const crop = computed(() => courtCrop(props.card))
const pips = computed(() => pipLayout(rank.value))

const s = computed(() => {
  const w = props.width
  // Les pointes centrales dominent nettement celles de l'index, et gardent la même taille
  // du 7 au 10, comme sur un vrai jeu : seul l'as porte un grand symbole. 0,18 est le plus
  // grand qui tienne sur le 10, dont les pointes du milieu frôlent celles des côtés.
  return {
    width: `${w}px`,
    height: `${Math.round(w * 1.44)}px`,
    radius: `${Math.max(3, Math.round(w * 0.08))}px`,
    pad: `${Math.max(2, Math.round(w * 0.04))}px`,
    rankSize: `${Math.max(8, Math.round(w * 0.18))}px`,
    // Les tracés remplissent leur cadre, là où un caractère de police laissait du vide
    // autour : à encombrement égal, ils sont un peu plus petits.
    indexPip: `${Math.max(5, Math.round(w * 0.1))}px`,
    inset: `${Math.round(w * 0.22)}px`,
    bigPip: `${Math.round(w * 0.36)}px`,
    smallPip: `${Math.round(w * 0.18)}px`,
    band: `${Math.max(2, Math.round(w * 0.03))}px`,
    // Le halo du gagnant suit la taille de la carte : fixe, il débordait des vignettes.
    shadow: props.winner
      ? `0 0 0 ${Math.max(2, Math.round(w * 0.025))}px #d9a441, 0 0 ${Math.round(w * 0.15)}px ${Math.round(w * 0.03)}px rgba(217,164,65,.55)`
      : `0 0 0 1px rgba(0,0,0,.25), 0 ${Math.max(1, Math.round(w * 0.03))}px ${Math.max(3, Math.round(w * 0.08))}px rgba(0,0,0,.45)`,
  }
})
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    :aria-label="clickable ? `Jouer le ${cardLabel(card)}` : cardLabel(card)"
    class="relative block shrink-0 overflow-hidden bg-white p-0 transition duration-150"
    :class="clickable ? 'cursor-pointer' : ''"
    :style="{ width: s.width, height: s.height, borderRadius: s.radius, boxShadow: s.shadow }"
    @click="clickable && emit('select', card)"
  >
    <!--
      Figure : l'illustration porte déjà ses propres index (en haut à gauche, en bas à
      droite). On n'en ajoute pas : deux index superposés rognaient le dessin.
    -->
    <!--
      L'image dessine son propre contour de carte, et un cadre intérieur à 7 à 10 unités
      du bord selon la figure. On garde le cadre, à la même marge sur les quatre côtés
      (courtCrop), et le contour part : sinon deux bords se voyaient l'un dans l'autre.
      Les SVG s'étirent (preserveAspectRatio="none") au format de la carte, écart de
      quelques pour cent, invisible. Décodage synchrone (et figures préchargées au
      démarrage) : sans lui, une figure posée sur le tapis restait blanche un instant.
    -->
    <img
      v-if="image"
      :src="image"
      alt=""
      decoding="sync"
      class="absolute max-w-none"
      :style="crop ?? undefined"
      draggable="false"
    />

    <template v-else>
      <!-- Index aux quatre coins : droits en haut, retournés en bas -->
      <span
        v-for="corner in [
          { v: 'top', h: 'left', flip: false },
          { v: 'top', h: 'right', flip: false },
          { v: 'bottom', h: 'left', flip: true },
          { v: 'bottom', h: 'right', flip: true },
        ]"
        :key="`${corner.v}${corner.h}`"
        class="absolute flex flex-col items-center leading-none"
        :style="{
          [corner.v]: s.pad,
          [corner.h]: s.pad,
          transform: corner.flip ? 'rotate(180deg)' : undefined,
        }"
      >
        <span class="block font-bold tracking-tight" :style="{ fontSize: s.rankSize, color: ink }">
          {{ RANK_LABEL[rank] }}
        </span>
        <SuitIcon
          :suit="suit"
          class="mt-[0.12em]"
          :style="{ width: s.indexPip, height: s.indexPip, color: ink }"
        />
      </span>

      <!-- Pointes -->
      <span class="absolute" :style="{ left: s.inset, right: s.inset, top: '9%', bottom: '9%' }">
        <SuitIcon
          v-for="(pip, i) in pips"
          :key="i"
          :suit="suit"
          class="absolute"
          :style="{
            left: `${pip.x}%`,
            top: `${pip.y}%`,
            width: pip.wide ? s.bigPip : s.smallPip,
            height: pip.wide ? s.bigPip : s.smallPip,
            color: ink,
            transform: `translate(-50%, -50%) rotate(${pip.flipped ? 180 : 0}deg)`,
          }"
        />
      </span>
    </template>

    <!--
      Atout : un cadre doré tout autour, à l'intérieur de la carte. Un simple bandeau en
      tête passait pour une bordure incomplète dans la main coupée par le bas.
    -->
    <span
      v-if="trump"
      class="pointer-events-none absolute inset-0"
      :style="{ borderRadius: s.radius, boxShadow: `inset 0 0 0 ${s.band} #d9a441` }"
    ></span>

    <!--
      Carte injouable : un voile opaque par-dessus, identique sur les figures et les
      pointes. La transparence laissait voir la carte voisine à travers.
    -->
    <span v-if="dimmed" class="pointer-events-none absolute inset-0 bg-[#0c2a20]/60"></span>
  </component>
</template>
