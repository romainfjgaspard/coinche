<script setup lang="ts">
/**
 * La table vue par le joueur : lui en bas, son partenaire en face,
 * les adversaires sur les côtés. Le tapis et les cartes suivent la maquette.
 */
import { computed, ref } from 'vue'
import PlayingCard from './PlayingCard.vue'
import type { Card } from '../game/cards'
import CardBack from './CardBack.vue'
import PlayerChip from './PlayerChip.vue'
import QuitGame from './QuitGame.vue'
import BiddingHistory from './BiddingHistory.vue'
import LastTrickCross from './LastTrickCross.vue'
import { useTableState } from '../composables/useTableState'
import { useTableLayout } from '../composables/useTableLayout'
import { type Vector, useTrickMotion } from '../composables/useTrickMotion'
import type { Spot } from '../composables/useTableState'
import { nameOf } from '../stores/roster'
import SuitBadge from './SuitBadge.vue'
import ModalDialog from './ModalDialog.vue'

const emit = defineEmits<{ stats: []; rules: [] }>()
const scoreSize = computed(() =>
  Math.max(...(session.game?.scores ?? [0, 0])) >= 1000 ? 'text-[25px]' : 'text-[30px]',
)
/** Toucher le contrat rouvre l'historique complet des enchères de la donne. */
const bidsVisible = ref(false)

const {
  session,
  me,
  around,
  remaining,
  contract,
  contractLabel,
  trickAt,
  trickOrder,
  trickWinnerCard,
  turnSpot,
  isTrump,
  canPlay,
  starsOf,
  lastBid,
  beloteOf,
} = useTableState()

/** Dos des cartes des autres joueurs : à moitié sortis de l'écran, comme tenus hors champ. */
const BACK = 30
const BACK_H = Math.round(BACK * 1.44)

/**
 * Ma main, comme sur PC : de grandes cartes, coupées par le bas de l'écran comme
 * tenues en main. On n'en voit que le haut, où sont les index ; les petites cartes
 * entières d'avant se lisaient mal. Près d'un tiers de la largeur par carte, et le pas se
 * resserre pour que les huit tiennent.
 */
const L = useTableLayout()
/**
 * La largeur de la colonne, pas celle de la fenêtre : entre 448 et 1024 px (tablette,
 * téléphone en paysage), la table reste dans sa colonne `max-w-md`, et les dernières
 * cartes, placées sur toute la fenêtre, sortaient de l'écran.
 */
const width = computed(() => Math.min(L.value.width, 448))
const handCardWidth = computed(() => Math.min(132, Math.round(width.value * 0.33)))
const visibleMain = computed(() => Math.round(handCardWidth.value * 1.44 * 0.58))
const hand = computed(() => {
  const n = session.sortedHand.length
  const step = Math.min(
    handCardWidth.value - 10,
    (width.value - 16 - handCardWidth.value) / Math.max(1, n - 1),
  )
  const total = handCardWidth.value + Math.max(0, n - 1) * step
  const x0 = Math.round(width.value / 2 - total / 2)
  return { step, cards: session.sortedHand.map((card, i) => ({ card, left: Math.round(x0 + i * step) })) }
})
/**
 * Roi et Dame d'atout sont voisins dans la main triée : leurs deux boutons « Belote »
 * se chevauchaient. Celui de gauche monte d'un cran.
 */
function beloteLift(card: Card): number {
  const withBelote = session.sortedHand.filter((x) => session.beloteCards.includes(x))
  return 30 * (withBelote.length - 1 - withBelote.indexOf(card))
}

/**
 * La table épurée, à la manière des applis de cartes : le tapis bord à bord, les mains
 * des autres à moitié hors de l'écran, le dernier pli en vignette dans un coin. Toute la
 * place va au pli en cours — le rebord de bois, les dos entiers et le dernier pli en grand
 * en prenaient la moitié.
 */
/** Le haut de la zone du pli : sous la pastille de mon partenaire. */
const TRICK_TOP = 122
/** Le bas de la zone du pli : juste au-dessus de ma pastille. */
const trickFloor = computed(() => visibleMain.value + 50)

/** Les cartes de côté mordent à peine sur celles du haut et du bas : les index restent lisibles. */
const SIDE_OVERLAP = 0.05
/** Les cartes du haut et du bas, l'une au-dessus de l'autre, se chevauchent à peine. */
const STACK = 1.92
/** Aussi grandes que le permettent la largeur de l'écran et la hauteur libre. */
const cardWidth = computed(() => {
  const byHeight = (L.value.height - TRICK_TOP - trickFloor.value) / (1.44 * STACK)
  const byWidth = (width.value - 20) / (3 - 2 * SIDE_OVERLAP)
  return Math.round(Math.max(54, Math.min(132, byHeight, byWidth)))
})
const cardHeight = computed(() => Math.round(cardWidth.value * 1.44))
const trickBox = computed(() => {
  const w = Math.round(cardWidth.value * (3 - 2 * SIDE_OVERLAP))
  const h = Math.round(cardHeight.value * STACK)
  // Centré dans la hauteur libre, entre mon partenaire et ma pastille.
  const free = L.value.height - TRICK_TOP - trickFloor.value
  const top = TRICK_TOP + Math.max(0, Math.round((free - h) / 2))
  return { w, h, top, left: Math.round(width.value / 2 - w / 2) }
})
const currentTrick = computed(() => ({
  width: `${trickBox.value.w}px`,
  height: `${trickBox.value.h}px`,
  top: `${trickBox.value.top}px`,
}))
/** Le milieu vertical du pli, où se tiennent les mains des adversaires. */
const middle = computed(() => trickBox.value.top + trickBox.value.h / 2)
/** Le nom des adversaires, au-dessus de leur main, sans mordre sur la carte de côté. */
const sideChipTop = computed(() =>
  Math.round(Math.min(middle.value - backsLength(8) / 2, middle.value - cardHeight.value / 2) - 40),
)
/** Hauteur d'une main de côté : les dos se recouvrent, on n'en voit qu'une bande. */
function backsLength(n: number): number {
  return BACK + Math.max(0, n - 1) * 12
}

/** Le centre de chaque carte du pli, dans le cadre du pli. */
const trickCenters = computed<Record<Spot, Vector>>(() => {
  const { w, h } = trickBox.value
  const cw = cardWidth.value
  const ch = cardHeight.value
  return {
    top: { x: w / 2, y: ch / 2 },
    me: { x: w / 2, y: h - ch / 2 },
    left: { x: cw / 2, y: h / 2 },
    right: { x: w - cw / 2, y: h / 2 },
  }
})
const trickStyle = (spot: Spot) => {
  const c = trickCenters.value[spot]
  return {
    left: `${Math.round(c.x - cardWidth.value / 2)}px`,
    top: `${Math.round(c.y - cardHeight.value / 2)}px`,
    zIndex: 10 + (trickOrder.value[spot] ?? 0),
  }
}
/** D'où vient chaque carte : la main de son joueur, dans le même repère que le pli. */
const origins = computed<Record<Spot, Vector>>(() => {
  const { left, top } = trickBox.value
  const c = trickCenters.value
  return {
    me: { x: 0, y: L.value.height - visibleMain.value / 2 - (top + c.me.y) },
    top: { x: 0, y: 40 - (top + c.top.y) },
    left: { x: -10 - (left + c.left.x), y: 0 },
    right: { x: width.value + 10 - (left + c.right.x), y: 0 },
  }
})
const motion = useTrickMotion(origins, trickCenters)
const spots: Spot[] = ['top', 'left', 'right', 'me']

/** Le dernier pli, en vignette ; une touche l'agrandit. */
const lastTrickOpen = ref(false)
const playing = computed(() => session.game?.phase !== 'bidding')
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#071d15] text-ivory">
    <!-- Tapis : feutre tissé, bord à bord sous le bandeau -->
    <div
      class="absolute inset-x-0 top-14 bottom-0 shadow-[inset_0_26px_64px_rgba(0,0,0,.3)]"
      style="
        background-color: #15583f;
        background-image:
          repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.028) 0 2px, transparent 2px 5px),
          repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.055) 0 2px, transparent 2px 5px);
      "
    ></div>

    <!-- Bandeau : donne, scores -->
    <header class="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 bg-felt-dark px-3">
      <QuitGame />
      <!-- Le numéro de donne passe au-dessus des scores : à gauche, la place va à « Quitter » -->
      <div class="flex grow flex-col items-center">
        <span class="text-[10px] font-medium tracking-wider text-sage">
          DONNE {{ session.game?.dealNumber ?? 0 }}
        </span>
        <!--
        Les scores en grand, dans les couleurs des équipes (or pour nous, bleu pour eux) :
        les mots « Nous » et « Eux » prenaient la place, et à 1000 points les boutons
        de droite sortaient de l'écran. Un cran plus petits au-delà de 999.
      -->
        <div class="flex items-baseline justify-center gap-2">
          <span class="font-display leading-none text-gold" :class="scoreSize" title="Nous">
            {{ session.game?.scores[session.myTeam] ?? 0 }}
          </span>
          <span class="text-sm text-dusk">·</span>
          <span class="font-display leading-none text-them" :class="scoreSize" title="Eux">
            {{ session.game?.scores[session.myTeam === 0 ? 1 : 0] ?? 0 }}
          </span>
        </div>
      </div>
      <!-- La pause, en icône comme les règles : il n'y avait pas la place d'un mot de plus -->
      <button
        v-if="session.canPause && !session.pause"
        type="button"
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 text-mist"
        aria-label="Mettre en pause"
        title="Mettre en pause"
        :disabled="session.busy"
        @click="session.togglePause()"
      >
        <svg viewBox="0 0 10 12" class="h-3 w-2.5" fill="currentColor" aria-hidden="true">
          <rect x="1" y="1" width="2.6" height="10" rx="0.8" />
          <rect x="6.4" y="1" width="2.6" height="10" rx="0.8" />
        </svg>
      </button>
      <!-- Les règles en « ? » : à 360 px, un bouton de plus en toutes lettres ne tenait pas -->
      <button
        type="button"
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 text-[15px] font-bold text-mist"
        aria-label="Les règles"
        title="Les règles"
        @click="emit('rules')"
      >
        ?
      </button>
      <button
        type="button"
        class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1.5 text-sm font-semibold text-mist"
        @click="emit('stats')"
      >
        Stats
      </button>
    </header>

    <!-- Contrat en cours, discret, en haut à droite : toucher rouvre l'historique des enchères -->
    <button
      v-if="contract"
      type="button"
      class="absolute top-[62px] right-2 z-20 flex max-w-[156px] cursor-pointer items-center gap-1.5 rounded-full border border-gold/50 bg-felt-dark/85 py-0.5 pr-3 pl-0.5"
      aria-label="Voir l'historique des enchères"
      @click="bidsVisible = true"
    >
      <SuitBadge :suit="contract.declaration" :size="30" />
      <span class="text-[17px] font-bold text-gold">{{ contractLabel }}</span>
      <span
        v-if="contract.multiplier > 1"
        class="rounded-full bg-red-card px-1.5 text-[10px] font-bold text-ivory"
        >×{{ contract.multiplier }}</span
      >
      <span class="truncate text-[13px] text-mist">{{ nameOf(contract.taker) }}</span>
    </button>

    <!-- L'historique des enchères, par-dessus la table, jusqu'à ce qu'on le ferme -->
    <ModalDialog v-if="bidsVisible && contract" @close="bidsVisible = false">
      <BiddingHistory />
    </ModalDialog>

    <!-- Partenaire, en face : ses cartes dépassent à peine sous le bandeau -->
    <div class="absolute inset-x-0 flex justify-center" :style="{ top: `${56 - Math.round(BACK_H / 2)}px` }">
      <CardBack
        v-for="i in remaining(around.top)"
        :key="i"
        :width="BACK"
        :style="{ marginLeft: i === 1 ? '0' : '-16px' }"
      />
    </div>
    <div class="absolute inset-x-0 top-[80px] z-10 flex justify-center">
      <PlayerChip
        :player="around.top"
        :dealer="session.game?.dealer === around.top"
        :active="session.toPlay === around.top || session.toBid === around.top"
        :stars="starsOf(around.top)"
        :belote="beloteOf(around.top)"
        :bid="lastBid.get(around.top)"
      />
    </div>

    <!-- Adversaires : leurs cartes à moitié hors de l'écran, leur nom juste au-dessus -->
    <template v-for="side in ['left', 'right'] as const" :key="side">
      <div
        class="absolute flex flex-col"
        :style="{
          [side]: `${-Math.round(BACK_H / 2)}px`,
          top: `${Math.round(middle - backsLength(remaining(around[side])) / 2)}px`,
        }"
      >
        <CardBack
          v-for="i in remaining(around[side])"
          :key="i"
          :width="BACK"
          rotated
          :style="{ marginTop: i === 1 ? '0' : `${12 - BACK}px` }"
        />
      </div>
      <div
        class="absolute z-10 flex flex-col gap-1"
        :class="side === 'left' ? 'items-start' : 'items-end'"
        :style="{ [side]: '6px', top: `${sideChipTop}px` }"
      >
        <PlayerChip
          :player="around[side]"
          :dealer="session.game?.dealer === around[side]"
          :active="session.toPlay === around[side] || session.toBid === around[side]"
          :stars="starsOf(around[side])"
          :belote="beloteOf(around[side])"
          :bid="lastBid.get(around[side])"
        />
      </div>
    </template>

    <!-- Le pli en cours : chaque carte arrive de son joueur, le pli part vers qui le remporte -->
    <div class="absolute left-1/2 -translate-x-1/2" :style="currentTrick">
      <!-- La place où l'on attend une carte : la mienne, ou celle du joueur dont c'est le tour -->
      <span
        v-if="turnSpot"
        class="absolute block rounded-lg border-2 border-dashed bg-black/10"
        :class="turnSpot === 'me' ? 'border-gold/70' : 'border-ivory/35'"
        :style="{ ...trickStyle(turnSpot), zIndex: 1, width: `${cardWidth}px`, height: `${cardHeight}px` }"
      ></span>
      <template v-for="spot in spots" :key="spot">
        <Transition
          :css="false"
          @enter="(el, done) => motion.enter(spot)(el, done)"
          @leave="(el, done) => motion.leave(spot)(el, done)"
        >
          <div v-if="trickAt[spot]" :key="trickAt[spot]" class="absolute" :style="trickStyle(spot)">
            <PlayingCard
              :card="trickAt[spot]!"
              :width="cardWidth"
              :winner="trickAt[spot] === trickWinnerCard"
            />
          </div>
        </Transition>
      </template>
    </div>

    <!-- Le dernier pli en vignette, en bas à gauche : une touche l'agrandit -->
    <button
      v-if="playing && session.lastTrick"
      type="button"
      class="absolute left-2 z-20 flex cursor-pointer flex-col items-start gap-0.5 rounded-lg p-1 transition active:bg-white/10"
      :style="{ bottom: `${visibleMain + 46}px` }"
      aria-label="Voir le dernier pli"
      @click="lastTrickOpen = true"
    >
      <span class="text-[11px] tracking-widest text-sage">DERNIER PLI</span>
      <LastTrickCross :trick="session.lastTrick" :width="34" />
    </button>
    <ModalDialog v-if="lastTrickOpen && session.lastTrick" title="Dernier pli" @close="lastTrickOpen = false">
      <div class="flex flex-col items-center gap-3">
        <LastTrickCross :trick="session.lastTrick" :width="68" />
        <p class="text-sm text-mist">
          pris par <span class="font-semibold text-gold">{{ nameOf(session.lastTrick.winner) }}</span>
        </p>
      </div>
    </ModalDialog>

    <!-- Les plis de la donne, en bas à droite -->
    <div
      v-if="playing && session.play"
      class="absolute right-3 z-20 flex flex-col items-end gap-0.5"
      :style="{ bottom: `${visibleMain + 50}px` }"
    >
      <span class="text-[11px] tracking-widest text-sage">PLIS</span>
      <span class="flex items-baseline gap-1.5 font-display text-[26px] leading-none tabular-nums">
        <span class="text-gold" title="Nous">{{ session.trickCounts[session.myTeam] }}</span>
        <span class="text-xs text-dusk">·</span>
        <span class="text-them" title="Eux">{{ session.trickCounts[session.myTeam === 0 ? 1 : 0] }}</span>
      </span>
    </div>

    <!-- Moi, entre le tapis et ma main -->
    <div
      class="absolute inset-x-0 flex items-center justify-center gap-2"
      :style="{ bottom: `${visibleMain + 10}px` }"
    >
      <PlayerChip
        :player="me"
        :dealer="session.game?.dealer === me"
        :active="session.myPlayTurn"
        :stars="starsOf(me)"
        :belote="beloteOf(me)"
        :bid="lastBid.get(me)"
        bid-beside
        me
      />
      <span v-if="session.myPlayTurn" class="text-[15px] font-semibold text-gold">à toi de jouer</span>
    </div>

    <!-- Ma main, tenue en main : coupée par le bas de l'écran -->
    <div data-testid="main" class="absolute inset-x-0 bottom-0" :style="{ height: `${visibleMain}px` }">
      <div v-for="c in hand.cards" :key="c.card" class="absolute top-0" :style="{ left: `${c.left}px` }">
        <PlayingCard
          :card="c.card"
          :width="handCardWidth"
          :dimmed="session.myPlayTurn && !canPlay(c.card)"
          :trump="isTrump(c.card)"
          :clickable="canPlay(c.card)"
          @select="session.playTheCard($event)"
        />
        <!--
          BEL-2 : l'annonce est un geste volontaire. Sans ce clic, la belote est perdue.
          Le bouton reste dans la partie visible de la carte, comme sur PC.
        -->
        <button
          v-if="canPlay(c.card) && session.beloteCards.includes(c.card)"
          type="button"
          :aria-label="`Jouer en annonçant : ${session.beloteLabel}`"
          :title="`Jouer en annonçant : ${session.beloteLabel}`"
          class="absolute left-0 z-20 flex cursor-pointer justify-center"
          :style="{ width: `${hand.step}px`, top: `${visibleMain - 34 - beloteLift(c.card)}px` }"
          @click.stop="session.playTheCard(c.card, true)"
        >
          <span
            class="flex h-7 items-center rounded-full border-2 border-felt bg-gold px-2 text-xs font-bold whitespace-nowrap text-felt shadow-md"
            >{{ session.beloteLabel }}</span
          >
        </button>
      </div>
    </div>
  </div>
</template>
