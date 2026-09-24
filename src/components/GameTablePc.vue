<script setup lang="ts">
/**
 * La table sur grand écran. Le tapis est plat et laisse les mains **autour** de lui :
 * la mienne en bas, coupée par le bord de l'écran comme tenue en main, celle du
 * partenaire au-dessus, celles des adversaires sur les côtés. Sur le tapis : le pli au
 * centre, le contrat en haut à gauche, le dernier pli et les plis gagnés en bas à droite.
 *
 * Toute la géométrie vient de `useTableLayout` ; les blocs de texte sont dessinés pour
 * du 1920×1080 et mis à l'échelle par `zoom`, posé sur un conteneur intérieur pour
 * ne jamais fausser les positions.
 */
import { computed, ref } from 'vue'
import PlayingCard from './PlayingCard.vue'
import CardBack from './CardBack.vue'
import PlayerChip from './PlayerChip.vue'
import { SUIT_GLYPH, isRed } from '../game/display'
import { PLAYER_NAMES } from '../game/players'
import type { Card } from '../game/cards'
import { type Place, useTableState } from '../composables/useTableState'
import { useTableLayout } from '../composables/useTableLayout'

const emit = defineEmits<{ stats: [] }>()

const {
  session, me, around, remaining, contract, contractLabel, trickAt, trickOrder,
  trickWinnerCard, isTrump, canPlay, starsOf, isActive,
} = useTableState()
const L = useTableLayout()

const px = (n: number) => `${n}px`

/** Le pli : quatre cartes en croix autour du centre du tapis, sans se chevaucher. */
const trickPos = computed(() => {
  const w = L.value.trickW
  const h = Math.round(w * 1.44)
  const cx = L.value.tapis.x + L.value.tapis.w / 2
  const cy = L.value.tapis.y + L.value.tapis.h / 2
  const dy = Math.round(h * 0.54)
  const dx = Math.round(w * 1.06)
  const at = (x: number, y: number) => ({ left: px(Math.round(x - w / 2)), top: px(Math.round(y - h / 2)) })
  return {
    top: at(cx, cy - dy),
    me: at(cx, cy + dy),
    left: at(cx - dx, cy),
    right: at(cx + dx, cy),
  } satisfies Record<Place, { left: string; top: string }>
})
const places: Place[] = ['top', 'left', 'right', 'me']

/** Ma main en éventail, centrée, coupée par le bas de l'écran. */
const hand = computed(() => {
  const n = session.sortedHand.length
  const total = L.value.cardW + Math.max(0, n - 1) * L.value.handStep
  const x0 = Math.round(L.value.width / 2 - total / 2)
  return session.sortedHand.map((card, i) => ({ card, left: x0 + i * L.value.handStep }))
})
const hovered = ref<Card | null>(null)
/** La carte survolée se soulève en entier, et passe devant ses voisines. */
const lift = computed(() => L.value.cardH - L.value.handVisible + Math.round(10 * L.value.u))

const teams = computed(() => [
  { label: 'Nous', count: session.trickCounts[session.myTeam], color: 'text-gold' },
  { label: 'Eux', count: session.trickCounts[session.myTeam === 0 ? 1 : 0], color: 'text-them' },
])
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#071d15] text-ivory">
    <!-- Bandeau : donne, scores -->
    <header class="absolute inset-x-0 top-0 bg-felt-dark" :style="{ height: px(L.header) }">
      <div class="flex h-16 items-center gap-3 px-8" :style="{ zoom: L.t }">
        <span class="w-40 text-sm font-medium tracking-wider text-sage">
          DONNE {{ session.game?.dealNumber ?? 0 }}
        </span>
        <div class="flex grow items-baseline justify-center gap-3">
          <span class="text-base font-semibold text-gold">Nous</span>
          <span class="font-display text-4xl leading-none">
            {{ session.game?.scores[session.myTeam] ?? 0 }}
          </span>
          <span class="text-base text-dusk">·</span>
          <span class="font-display text-4xl leading-none text-mist">
            {{ session.game?.scores[session.myTeam === 0 ? 1 : 0] ?? 0 }}
          </span>
          <span class="text-base font-semibold text-them">Eux</span>
        </div>
        <div class="flex w-40 justify-end">
          <button
            type="button"
            class="cursor-pointer rounded-lg border border-white/20 px-3.5 py-1.5 text-sm font-semibold text-mist transition hover:border-white/40 hover:bg-white/5"
            @click="emit('stats')"
          >Stats</button>
        </div>
      </div>
    </header>

    <!-- Tapis : feutre tissé, rebord de bois, liseré cousu -->
    <div
      class="absolute shadow-[inset_0_0_0_3px_rgba(217,164,65,.22),inset_0_26px_64px_rgba(0,0,0,.3),0_22px_54px_rgba(0,0,0,.55)]"
      :style="{
        left: px(L.tapis.x), top: px(L.tapis.y), width: px(L.tapis.w), height: px(L.tapis.h),
        borderRadius: px(Math.round(44 * L.u)),
        border: `${L.rim}px solid #33241a`,
        backgroundColor: '#15583f',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 5px),' +
          'repeating-linear-gradient(-45deg, rgba(0,0,0,.055) 0 2px, transparent 2px 5px)',
      }"
    >
      <div
        class="absolute border border-dashed border-gold/30"
        :style="{ inset: px(Math.round(12 * L.u)), borderRadius: px(Math.round(30 * L.u)) }"
      ></div>
    </div>

    <!-- Contrat, en haut à gauche du tapis -->
    <div
      v-if="contract"
      class="absolute"
      :style="{ left: px(L.tapis.x + L.rim + Math.round(28 * L.u)), top: px(L.tapis.y + L.rim + Math.round(24 * L.u)) }"
    >
      <div :style="{ zoom: L.t }">
        <p class="text-xs font-semibold tracking-widest text-sage">CONTRAT</p>
        <div class="mt-1.5 flex items-center gap-2.5">
          <span class="font-display text-4xl leading-none text-gold">{{ contractLabel }}</span>
          <!-- Le symbole sur fond ivoire, comme sur une carte : noir sur le tapis, il disparaissait -->
          <span
            class="flex h-9 min-w-9 items-center justify-center rounded-full bg-ivory px-1.5 text-2xl leading-none font-bold"
            :class="contract.trump && isRed(contract.trump) ? 'text-red-card' : 'text-felt-dark'"
          >{{ contract.trump ? SUIT_GLYPH[contract.trump] : (contract.declaration === 'sa' ? 'SA' : 'TA') }}</span>
        </div>
        <p class="mt-1.5 text-base text-mist">par <span class="font-semibold text-ivory">{{ PLAYER_NAMES[contract.taker] }}</span></p>
        <p
          v-if="contract.multiplier > 1"
          class="mt-2 inline-block rounded-full bg-red-card px-3 py-1 text-sm font-bold tracking-wide text-ivory"
        >{{ contract.multiplier === 4 ? 'SURCOINCHÉ ×4' : 'COINCHÉ ×2' }}</p>
      </div>
    </div>

    <!-- Dernier pli et plis de la donne, en bas à droite du tapis -->
    <div
      v-if="session.play"
      class="absolute"
      :style="{
        right: px(L.width - (L.tapis.x + L.tapis.w) + L.rim + Math.round(28 * L.u)),
        bottom: px(L.height - (L.tapis.y + L.tapis.h) + L.rim + Math.round(22 * L.u)),
      }"
    >
      <div class="flex items-start gap-7" :style="{ zoom: L.t }">
        <!-- Largeur fixe : le bloc ne doit pas bouger quand arrive le premier pli -->
        <div class="w-[244px]">
          <p class="mb-2.5 text-xs font-semibold tracking-widest text-sage">DERNIER PLI</p>
          <!-- Côte à côte, sans chevauchement : l'index des figures doit rester lisible -->
          <div v-if="session.lastTrick" class="flex gap-1.5">
            <PlayingCard
              v-for="p in session.lastTrick.plays"
              :key="p.card"
              :card="p.card"
              :width="56"
              :winner="p.player === session.lastTrick.winner"
            />
          </div>
          <p v-else class="flex h-[81px] items-center text-sm text-sage">aucun pli joué</p>
          <p class="mt-1.5 h-5 text-sm text-mist">
            <template v-if="session.lastTrick">
              pris par <span class="font-semibold text-gold">{{ PLAYER_NAMES[session.lastTrick.winner] }}</span>
            </template>
          </p>
        </div>
        <div>
          <p class="mb-1.5 text-xs font-semibold tracking-widest text-sage">PLIS</p>
          <div v-for="t in teams" :key="t.label" class="flex h-7 items-center gap-2.5">
            <span class="w-10 text-sm font-semibold" :class="t.color">{{ t.label }}</span>
            <span class="w-5 text-right font-display text-2xl leading-none tabular-nums" :class="t.color">{{ t.count }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Partenaire, au-dessus du tapis -->
    <div
      class="absolute flex -translate-x-1/2 flex-col items-center"
      :style="{ left: '50%', top: px(L.partnerY), gap: px(Math.round(14 * L.u)) }"
    >
      <div class="flex">
        <CardBack
          v-for="i in remaining(around.top)" :key="i" :width="L.backW"
          :style="{ marginLeft: i === 1 ? '0' : px(L.backStep - L.backW) }"
        />
      </div>
      <div :style="{ zoom: L.t * 1.35 }">
        <PlayerChip
          :player="around.top" :dealer="session.game?.dealer === around.top"
          :active="isActive(around.top)" :stars="starsOf(around.top)"
        />
      </div>
    </div>

    <!-- Adversaires, de part et d'autre du tapis -->
    <div
      v-for="side in (['left', 'right'] as const)"
      :key="side"
      class="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      :style="{ left: px(side === 'left' ? L.sideX : L.width - L.sideX), top: px(L.tapis.y + L.tapis.h / 2), gap: px(Math.round(14 * L.u)) }"
    >
      <div class="flex flex-col">
        <CardBack
          v-for="i in remaining(around[side])" :key="i" :width="L.backW" rotated
          :style="{ marginTop: i === 1 ? '0' : px(L.backStep - L.backW) }"
        />
      </div>
      <div :style="{ zoom: L.t * 1.35 }">
        <PlayerChip
          :player="around[side]" :dealer="session.game?.dealer === around[side]"
          :active="isActive(around[side])" :stars="starsOf(around[side])"
        />
      </div>
    </div>

    <!-- Le pli -->
    <template v-for="place in places" :key="place">
      <div
        v-if="trickAt[place]"
        class="absolute"
        :style="{ ...trickPos[place], zIndex: 10 + (trickOrder[place] ?? 0) }"
      >
        <PlayingCard :card="trickAt[place]!" :width="L.trickW" :winner="trickAt[place] === trickWinnerCard" />
      </div>
    </template>
    <!-- Ma place dans le pli, quand c'est à moi -->
    <span
      v-if="!trickAt.me && session.myPlayTurn"
      class="absolute rounded-xl border-2 border-dashed border-gold/60 bg-black/10"
      :style="{ ...trickPos.me, width: px(L.trickW), height: px(Math.round(L.trickW * 1.44)) }"
    ></span>

    <!-- Moi, entre le tapis et ma main -->
    <div
      class="absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
      :style="{ left: '50%', top: px(L.meY) }"
    >
      <div class="flex items-center gap-3" :style="{ zoom: L.t * 1.35 }">
        <PlayerChip :player="me" :dealer="session.game?.dealer === me" :active="isActive(me)" :stars="starsOf(me)" me />
        <span v-if="session.myPlayTurn" class="text-sm font-semibold text-gold">à toi de jouer</span>
        <span v-else-if="session.myBidTurn" class="text-sm font-semibold text-gold">à toi de parler</span>
      </div>
    </div>

    <!-- Ma main, tenue en main : coupée par le bas de l'écran -->
    <div data-testid="main" class="absolute inset-x-0 bottom-0" :style="{ height: px(L.handVisible) }">
      <div
        v-for="c in hand"
        :key="c.card"
        class="absolute top-0 transition-transform duration-150"
        :style="{
          left: px(c.left),
          transform: hovered === c.card ? `translateY(-${lift}px)` : undefined,
          zIndex: hovered === c.card ? 30 : 1,
        }"
        @mouseenter="hovered = c.card"
        @mouseleave="hovered = null"
      >
        <PlayingCard
          :card="c.card"
          :width="L.cardW"
          :dimmed="session.myPlayTurn && !canPlay(c.card)"
          :trump="isTrump(c.card)"
          :clickable="canPlay(c.card)"
          @select="session.playTheCard($event)"
        />
        <!--
          BEL-2 : l'annonce est un geste volontaire. Sans ce clic, la belote est perdue.
          Le bouton reste dans la bande visible de la carte : en haut à droite, la carte
          suivante de l'éventail le recouvrait.
        -->
        <button
          v-if="canPlay(c.card) && session.beloteCards.includes(c.card)"
          type="button"
          aria-label="Jouer en annonçant la belote"
          title="Jouer en annonçant la belote"
          class="absolute left-0 flex cursor-pointer justify-center"
          :style="{ width: px(L.handStep), top: px(L.handVisible - Math.round(52 * L.t)) }"
          @click.stop="session.playTheCard(c.card, true)"
        >
          <span
            class="flex h-8 items-center rounded-full border-2 border-felt bg-gold px-3 text-sm font-bold text-felt shadow-md transition hover:brightness-110"
            :style="{ zoom: L.t }"
          >Belote</span>
        </button>
      </div>
    </div>
  </div>
</template>
