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
import { SUIT_GLYPH } from '../game/display'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableState } from '../composables/useTableState'
import { useTableLayout } from '../composables/useTableLayout'
import { nameOf } from '../stores/roster'

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
  trickWinnerCard,
  isTrump,
  canPlay,
  starsOf,
  lastBid,
  beloteOf,
} = useTableState()

/** Tailles de cartes : la table double de largeur sur un écran d'ordinateur. */
const large = useLargeScreen()
const backWidth = computed(() => (large.value ? 34 : 26))
const trickWidth = computed(() => (large.value ? 44 : 46))

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
const handCardWidth = computed(() => Math.min(120, Math.round(width.value * 0.3)))
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
/** Le bas du tapis : juste au-dessus de ma pastille, elle-même au-dessus de ma main. */
const feltBottom = computed(() => visibleMain.value + 44)

/**
 * Le tapis. Sur téléphone il déborde largement pour donner l'illusion d'une table
 * plus grande que l'écran.
 */
const felt = computed(() => `top: 11%; left: 2%; right: 2%; bottom: ${feltBottom.value}px;`)
const rim = computed(() => `top: 14%; left: 5%; right: 5%; bottom: ${feltBottom.value + 24}px;`)

/**
 * Le pli en cours, remonté au-dessus du dernier pli : sur téléphone, le dernier pli
 * en grand prend le bas du tapis. Tant pis s'il n'est plus centré.
 */
const tricksBottom = computed(() => feltBottom.value + 30)
const lastTrickHeight = computed(() => 2 * Math.round(trickWidth.value * 1.44) + 5 + 44)
const trickBottom = computed(() => tricksBottom.value + lastTrickHeight.value + 14)
/** Le bas de mon partenaire (cartes retournées et nom, sous l'en-tête), plus une marge. */
const TRICK_TOP = 200

/**
 * Les cartes du pli en cours, sur téléphone : aussi grandes que le permet la place
 * entre mon partenaire et le dernier pli, et entre les deux adversaires. À taille
 * fixe, elles restaient petites au milieu du tapis sur un grand téléphone.
 */
const cardWidth = computed(() => {
  if (large.value) return 78
  const byHeight = (L.value.height - TRICK_TOP - trickBottom.value - 12) / 2.88
  const byWidth = (Math.min(L.value.width, 448) - 136) / 3 // 448 : la colonne max-w-md
  return Math.round(Math.max(54, Math.min(100, byHeight, byWidth)))
})
const trickHeight = computed(() => 2 * Math.round(cardWidth.value * 1.44) + 12)
const currentTrick = computed(() => ({
  width: `${3 * cardWidth.value + 12}px`,
  height: `${trickHeight.value}px`,
  bottom: `${trickBottom.value}px`,
}))
/**
 * Les adversaires, nom juste au-dessus du dernier pli : à mi-écran ils tombaient
 * dessus, et à hauteur du pli en cours leur nom mordait sur la carte de côté.
 */
const sidePanel = computed(() => ({ bottom: `${tricksBottom.value + lastTrickHeight.value + 2}px` }))
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#071d15] text-ivory">
    <!-- Tapis : feutre tissé, rebord de bois, liseré cousu -->
    <div
      class="absolute rounded-[28px] border-[13px] border-[#33241a] shadow-[inset_0_0_0_3px_rgba(217,164,65,.22),inset_0_26px_64px_rgba(0,0,0,.3),0_22px_54px_rgba(0,0,0,.55)] lg:rounded-[40px] lg:border-[16px]"
      :style="
        felt +
        `
        background-color: #15583f;
        background-image:
          repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 5px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,.055) 0 2px, transparent 2px 5px);
      `
      "
    ></div>
    <div
      class="absolute rounded-[18px] border border-dashed border-gold/30 lg:rounded-[26px]"
      :style="rim"
    ></div>

    <!-- Bandeau : donne, scores -->
    <header class="absolute inset-x-0 top-0 flex h-14 items-center gap-2 bg-felt-dark px-3 lg:h-16 lg:px-8">
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

    <!-- Contrat en cours -->
    <div v-if="contract" class="absolute inset-x-0 top-16 flex justify-center">
      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-full border border-gold/50 bg-gold/15 py-1 pl-1.5 pr-3.5"
        aria-label="Voir l'historique des enchères"
        @click="bidsVisible = true"
      >
        <!-- Le symbole sur fond ivoire, comme sur une carte : noir sur le tapis, il disparaissait -->
        <span
          class="flex h-6 min-w-6 items-center justify-center rounded-full bg-ivory px-1 text-base leading-none font-bold"
          :class="contract.trump === 'h' || contract.trump === 'd' ? 'text-red-card' : 'text-felt-dark'"
          >{{
            contract.trump ? SUIT_GLYPH[contract.trump] : contract.declaration === 'sa' ? 'SA' : 'TA'
          }}</span
        >
        <span class="text-sm font-bold text-gold">{{ contractLabel }}</span>
        <span class="text-xs text-mist">par {{ nameOf(contract.taker) }}</span>
        <span
          v-if="contract.multiplier > 1"
          class="rounded-full bg-red-card px-2 py-0.5 text-[11px] font-bold tracking-wide text-ivory"
          >{{ contract.multiplier === 4 ? 'SURCOINCHÉ ×4' : 'COINCHÉ ×2' }}</span
        >
        <span class="text-[11px] text-sage" aria-hidden="true">▾</span>
      </button>
    </div>

    <!-- L'historique des enchères, par-dessus la table, jusqu'à ce qu'on le ferme -->
    <Teleport to="body">
      <div
        v-if="bidsVisible && contract"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 pb-3"
        @click.self="bidsVisible = false"
      >
        <div class="w-full max-w-sm">
          <BiddingHistory />
          <button
            type="button"
            class="mt-2 h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-felt-dark text-sm font-semibold text-mist"
            @click="bidsVisible = false"
          >
            Fermer
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Partenaire, en face -->
    <div class="absolute inset-x-0 top-28 flex flex-col items-center gap-1.5 lg:top-36 lg:gap-3">
      <div class="flex">
        <CardBack v-for="i in remaining(around.top)" :key="i" :width="backWidth" class="-ml-2.5" />
      </div>
      <PlayerChip
        :player="around.top"
        :dealer="session.game?.dealer === around.top"
        :active="session.toPlay === around.top || session.toBid === around.top"
        :stars="starsOf(around.top)"
        :belote="beloteOf(around.top)"
        :bid="lastBid.get(around.top)"
      />
    </div>

    <!-- Adversaires, sur les côtés -->
    <div
      :style="large ? undefined : sidePanel"
      class="absolute left-2 flex flex-col items-center gap-1.5 lg:top-1/2 lg:-translate-y-1/2 lg:left-[5%] lg:gap-3"
    >
      <div class="flex flex-col max-lg:ml-3 max-lg:self-start">
        <CardBack v-for="i in remaining(around.left)" :key="i" :width="backWidth" rotated class="-mt-2.5" />
      </div>
      <PlayerChip
        :player="around.left"
        :dealer="session.game?.dealer === around.left"
        :active="session.toPlay === around.left || session.toBid === around.left"
        :stars="starsOf(around.left)"
        :belote="beloteOf(around.left)"
        :bid="lastBid.get(around.left)"
      />
    </div>
    <div
      :style="large ? undefined : sidePanel"
      class="absolute right-2 flex flex-col items-center gap-1.5 lg:top-1/2 lg:-translate-y-1/2 lg:right-[5%] lg:gap-3"
    >
      <div class="flex flex-col max-lg:mr-3 max-lg:self-end">
        <CardBack v-for="i in remaining(around.right)" :key="i" :width="backWidth" rotated class="-mt-2.5" />
      </div>
      <PlayerChip
        :player="around.right"
        :dealer="session.game?.dealer === around.right"
        :active="session.toPlay === around.right || session.toBid === around.right"
        :stars="starsOf(around.right)"
        :belote="beloteOf(around.right)"
        :bid="lastBid.get(around.right)"
      />
    </div>

    <!-- Le pli en cours -->
    <div
      class="absolute left-1/2 -translate-x-1/2 lg:top-1/2 lg:size-[22rem] lg:-translate-y-1/2"
      :style="large ? undefined : currentTrick"
    >
      <div class="absolute left-1/2 top-0 -translate-x-1/2">
        <PlayingCard
          v-if="trickAt.top"
          :card="trickAt.top"
          :width="cardWidth"
          :winner="trickAt.top === trickWinnerCard"
        />
      </div>
      <div class="absolute left-0 top-1/2 -translate-y-1/2">
        <PlayingCard
          v-if="trickAt.left"
          :card="trickAt.left"
          :width="cardWidth"
          :winner="trickAt.left === trickWinnerCard"
        />
      </div>
      <div class="absolute right-0 top-1/2 -translate-y-1/2">
        <PlayingCard
          v-if="trickAt.right"
          :card="trickAt.right"
          :width="cardWidth"
          :winner="trickAt.right === trickWinnerCard"
        />
      </div>
      <div class="absolute bottom-0 left-1/2 -translate-x-1/2">
        <PlayingCard
          v-if="trickAt.me"
          :card="trickAt.me"
          :width="cardWidth"
          :winner="trickAt.me === trickWinnerCard"
        />
        <span
          v-else-if="session.myPlayTurn"
          class="block rounded-lg border-2 border-dashed border-gold/50 bg-black/10"
          :style="{ width: `${cardWidth}px`, height: `${Math.round(cardWidth * 1.44)}px` }"
        ></span>
      </div>
    </div>

    <!-- Dernier pli et plis de la donne, dans le tapis en bas à droite : comme sur PC -->
    <div class="absolute right-[7%] flex items-end gap-3.5" :style="{ bottom: `${tricksBottom}px` }">
      <div class="flex flex-col gap-1">
        <span class="text-[10px] tracking-widest text-sage">DERNIER PLI</span>
        <!-- En croix : chaque carte à la place de celui qui l'a jouée -->
        <LastTrickCross v-if="session.lastTrick" :trick="session.lastTrick" :width="trickWidth" />
        <span v-else class="flex h-[137px] w-[148px] items-center text-[11px] text-sage">aucun pli joué</span>
        <span class="h-4 text-[11px] text-mist">
          <template v-if="session.lastTrick">
            pris par <span class="font-semibold text-gold">{{ nameOf(session.lastTrick.winner) }}</span>
          </template>
        </span>
      </div>
      <div class="flex flex-col gap-0.5 pb-4">
        <span class="text-[10px] tracking-widest text-sage">PLIS</span>
        <div
          v-for="(row, i) in [
            { team: 'Nous', count: session.trickCounts[session.myTeam], color: 'text-gold' },
            { team: 'Eux', count: session.trickCounts[session.myTeam === 0 ? 1 : 0], color: 'text-them' },
          ]"
          :key="i"
          class="flex items-center gap-2"
        >
          <span class="w-9 text-xs font-semibold" :class="row.color">{{ row.team }}</span>
          <span class="w-4 text-right font-display text-xl leading-none tabular-nums" :class="row.color">{{
            row.count
          }}</span>
        </div>
      </div>
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
        me
      />
      <span v-if="session.myPlayTurn" class="text-[13px] font-semibold text-gold">à toi de jouer</span>
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
